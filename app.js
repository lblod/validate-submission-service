import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import { TASK_READY_FOR_VALIDATION_STATUS, TASK_ONGOING_STATUS, TASK_SUCCESS_STATUS, TASK_FAILURE_STATUS, updateTaskStatus } from './lib/submission-task';
import { getSubmissionByTask, getSubmissionBySubmissionDocument, getSubmissionStatus, SUBMITABLE_STATUS, SENT_STATUS, CONCEPT_STATUS } from './lib/submission';
import { getSubmissionForm, updateSubmissionForm, cleanupSubmissionForm, createSubmissionForm } from './lib/submission-form';

app.use(bodyParser.json({ type: function(req) { return /^application\/json/.test(req.get('content-type')); } }));

app.get('/', function(req, res) {
  res.send('Hello from validate-submission-service');
});

/*
 * DELTA HANDLING
 */

app.post('/delta', async function(req, res, next) {
  const tasks = getAutomaticSubmissionTasks(req.body);
  if (!tasks.length) {
    console.log("Delta does not contain a automatic submission task with status 'ready-for-validation'. Nothing should happen.");
    return res.status(204).send();
  }

  for (let task of tasks) {
    try {
      await updateTaskStatus(task, TASK_ONGOING_STATUS);
      const submission = await getSubmissionByTask(task);

      const handleAutomaticSubmission = async () => {
        try {
          await submission.process();
          await updateTaskStatus(task, TASK_SUCCESS_STATUS);
        } catch (e) {
          await updateTaskStatus(task, TASK_FAILURE_STATUS);
        }
      };

      handleAutomaticSubmission(); // async processing
    } catch (e) {
      console.log(`Something went wrong while handling deltas for automatic submission task ${task}`);
      console.log(e);
      try {
        await updateTaskStatus(task, TASK_FAILURE_STATUS);
      } catch (e) {
        console.log(`Failed to update state of task ${task} to failure state. Is the connection to the database broken?`);
      }
      return next(e);
    }
  }

  return res.status(200).send({ data: tasks });
});

/**
 * Returns the automatic submission tasks that are ready for validation
 * from the delta message. An empty array if there are none.
 *
 * @param Object delta Message as received from the delta notifier
*/
function getAutomaticSubmissionTasks(delta) {
  const inserts = flatten(delta.map(changeSet => changeSet.inserts));
  return inserts.filter(isTriggerTriple).map(t => t.subject.value);
}

/**
 * Returns whether the passed triple is a trigger for the validation process
 *
 * @param Object triple Triple as received from the delta notifier
*/
function isTriggerTriple(triple) {
  return triple.predicate.value == 'http://www.w3.org/ns/adms#status'
    && triple.object.value == TASK_READY_FOR_VALIDATION_STATUS;
};


/*
 * SUBMISSION FORM ENDPOINTS
 */

/**
 * Get data for a submission form
 *
 * @return {SubmissionForm} containing the harvested TTL, additions and deletions
*/
app.get('/submission-forms/:uuid', async function(req, res, next) {
  const uuid = req.params.uuid;
  try {
    const form = await getSubmissionForm(uuid);
    return res.status(200).send(form);
  } catch (e) {
    console.log(`Something went wrong while retrieving submission with id ${uuid}`);
    console.log(e);
    return next(e);
  }
});

//TODO revist API
app.post('/submission-forms', async function(req, res, next){
  const { additions, removals, submission, subject } = req.body;
  console.log('debug');
  await createSubmissionForm({ additions, removals, submission, subject });
  return res.status(201).send();
});

/**
 * Update data of a submission form
 *
 * @return {SubmissionForm} containing the additions and deletions. The source cannot be updated.
*/
app.put('/submission-forms/:uuid', async function(req, res, next) {
  const uuid = req.params.uuid;
  try {
    const { additions, removals } = req.body;
    await updateSubmissionForm(uuid, { additions, removals });
    return res.status(204).send();
  } catch (e) {
    console.log(`Something went wrong while updating submission with id ${uuid}`);
    console.log(e);
    return next(e);
  }
});

/**
 * Submit a submission form
 * I.e. validate the filled in form. If it's valid, update the status of the submission to 'sent'
*/
app.post('/submission-forms/:uuid/submit', async function(req, res, next) {
  const uuid = req.params.uuid;
  let submissionForm;
  try {
    submissionForm = await getSubmissionForm(uuid);
  }
  catch(error){
    console.log(error);
    return res.status(500).send({ title: 'Unable to submit form' });
  }

  //We work on the merged data.
  const submission = await getSubmissionBySubmissionDocument(uuid, submissionForm.mergedData);
  try {
    let status = await getSubmissionStatus(submission.submission);
    if (status == SENT_STATUS){
      return res.status(422).send({ title: `Submission ${submission.submission} already processed` });
    }

    await submission.updateStatus(SUBMITABLE_STATUS);

    status = await submission.process();

    if (status == SENT_STATUS) {
      await cleanupSubmissionForm(uuid);
      return res.status(204).send();
    } else {
      return res.status(400).send({ title: 'Unable to submit form' });
    }
  }
  catch(error){
    await submission.updateStatus(CONCEPT_STATUS);
    console.log(`Something went wrong while updating submission with id ${uuid}`);
    console.log(error);
    return next(error);
  }
});



app.use(errorHandler);
