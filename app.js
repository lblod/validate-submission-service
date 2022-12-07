import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import flatten from 'lodash.flatten';
import { updateTaskStatus } from './lib/submission-task';
import { getSubmissionByTask, getSubmissionBySubmissionDocument, SUBMITABLE_STATUS, SENT_STATUS, CONCEPT_STATUS } from './lib/submission';
import * as env from './env.js';
import { saveError } from './lib/utils.js';

app.use(bodyParser.json({ type: function(req) { return /^application\/json/.test(req.get('content-type')); } }));

app.get('/', function(req, res) {
  res.send('Hello from validate-submission-service');
});

/*
 * DELTA HANDLING
 */

app.post('/delta', async function (req, res, next) {
  //We can already send a 200 back. The delta-notifier does not care about the result, as long as the request is closed.
  res.status(200).send().end();
  
  try {
    //Don't trust the delta-notifier, filter as best as possible. We just need the task that was created to get started.
    const actualTaskUris = req.body
      .map((changeset) => changeset.inserts)
      .filter((inserts) => inserts.length > 0)
      .flat()
      .filter((insert) => insert.predicate.value === env.OPERATION_PREDICATE)
      .filter((insert) => insert.object.value === env.VALIDATE_OPERATION)
      .map((insert) => insert.subject.value);

    for (const taskUri of actualTaskUris) {
      try {
        await updateTaskStatus(taskUri, env.TASK_ONGOING_STATUS);
        
        const submission = await getSubmissionByTask(taskUri, { req });
        const { status, logicalFileUri } = await submission.process();
        const resultingStatus = status;

        let saveStatus;
        switch (resultingStatus) {
          case SENT_STATUS:
            saveStatus = env.TASK_SUCCESSFUL_SENT_STATUS;
            break;
          case CONCEPT_STATUS:
            saveStatus = env.TASK_SUCCESSFUL_CONCEPT_STATUS;
            break;
          default:
            saveStatus = resultingStatus;
            break;
        }

        await updateTaskStatus(
          taskUri,
          env.TASK_SUCCESS_STATUS,
          undefined, //Potential errorURI
          saveStatus,
          logicalFileUri
        );
      }
      catch (error) {
        const message = `Something went wrong while enriching for task ${taskUri}`;
        console.error(`${message}\n`, error.message);
        console.error(error);
        const errorUri = await saveError({ message, detail: error.message, });
        await updateTaskStatus(taskUri, env.TASK_FAILURE_STATUS, errorUri);
      }
    }
  }
  catch (error) {
    const message = 'The task for enriching a submission could not even be started or finished due to an unexpected problem.';
    console.error(`${message}\n`, error.message);
    console.error(error);
    await saveError({ message, detail: error.message, });
  }
});

/*
 * SUBMISSION FORM ENDPOINTS
 */

/**
 * Update the additions and deletions of a submission form. The source, meta and form cannot be updated.
*/
app.put('/submission-documents/:uuid', async function(req, res, next) {
  const uuid = req.params.uuid;
  const submission = await getSubmissionBySubmissionDocument(uuid);

  if (submission) {
    try {
      if (submission.status == SENT_STATUS) {
        return res.status(422).send({ title: `Submission ${submission.uri} already submitted` });
      } else {
        const { additions, removals } = req.body;
        await submission.update({ additions, removals });
        return res.status(204).send();
      }
    } catch (e) {
      console.log(`Something went wrong while updating submission with id ${uuid}`);
      console.log(e);
      return next(e);
    }
  } else {
    return res.status(404).send({ title: `Submission ${uuid} not found` });
  }

});

/**
 * Submit a submission document
 * I.e. validate the filled in form. If it's valid, update the status of the submission to 'sent'
*/
app.post('/submission-documents/:uuid/submit', async function(req, res, next) {
  const uuid = req.params.uuid;
  const submission = await getSubmissionBySubmissionDocument(uuid);

  if (submission) {
    try {
      if (submission.status == SENT_STATUS) {
        return res.status(422).send({ title: `Submission ${submission.uri} already submitted` });
      } else {
        await submission.updateStatus(SUBMITABLE_STATUS);
        const newStatus = (await submission.process()).status;
        if (newStatus == SENT_STATUS) {
          return res.status(204).send();
        } else {
          return res.status(400).send({ title: 'Unable to submit form' });
        }
      }
    }
    catch (error){
      await submission.updateStatus(CONCEPT_STATUS);
      console.log(`Something went wrong while submitting submission with id ${uuid}`);
      console.log(error);
      return next(error);
    }
  } else {
    return res.status(404).send({ title: `Submission ${uuid} not found` });
  }
});

app.use(errorHandler);
