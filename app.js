import { app, errorHandler } from 'mu';
import bodyParser from 'body-parser';
import {
  getSubmissionByTask,
  getSubmissionBySubmissionDocument,
} from './lib/submission';
import * as env from './env.js';
import * as cts from './automatic-submission-flow-tools/constants.js';
import * as tsk from './automatic-submission-flow-tools/asfTasks.js';
import * as del from './automatic-submission-flow-tools/deltas.js';
import * as err from './automatic-submission-flow-tools/errors.js';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

app.use(errorHandler);
app.use(
  bodyParser.json({
    type: function (req) {
      return /^application\/json/.test(req.get('content-type'));
    },
  })
);

app.get('/', function (req, res) {
  res.send('Hello from validate-submission-service');
});

/*
 * DELTA HANDLING
 */

app.post('/delta', async function (req, res) {
  //We can already send a 200 back. The delta-notifier does not care about the result, as long as the request is closed.
  res.status(200).send().end();

  try {
    //Don't trust the delta-notifier, filter as best as possible. We just need the task that was created to get started.
    const actualTasks = del.getSubjects(
      req.body,
      namedNode(cts.PREDICATE_TABLE.task_operation),
      namedNode(cts.OPERATIONS.validate)
    );

    for (const task of actualTasks) {
      const taskUri = task.value;
      try {
        await tsk.updateStatus(
          task,
          namedNode(cts.TASK_STATUSES.busy),
          namedNode(cts.SERVICES.validateSubmission)
        );

        const submission = await getSubmissionByTask(taskUri);
        const { logicalFileUri } = await submission.process();

        await tsk.updateStatus(
          task,
          namedNode(cts.TASK_STATUSES.success),
          namedNode(cts.SERVICES.validateSubmission),
          { files: [namedNode(logicalFileUri)] }
        );
      } catch (error) {
        const message = `Something went wrong while enriching for task ${taskUri}`;
        console.error(`${message}\n`, error.message);
        console.error(error);
        const errorNode = await err.create(
          namedNode(cts.SERVICES.validateSubmission),
          message,
          error.message
        );
        await tsk.updateStatus(
          task,
          namedNode(cts.TASK_STATUSES.failed),
          namedNode(cts.SERVICES.validateSubmission),
          undefined,
          errorNode
        );
      }
    }
  } catch (error) {
    const message =
      'The task for enriching a submission could not even be started or finished due to an unexpected problem.';
    console.error(`${message}\n`, error.message);
    console.error(error);
    await err.create(
      namedNode(cts.SERVICES.validateSubmission),
      message,
      error.message
    );
  }
});

/*
 * SUBMISSION FORM ENDPOINTS
 */

/**
 * Update the additions and deletions of a submission form. The source, meta and form cannot be updated.
 */
app.put('/submission-documents/:uuid', async function (req, res, next) {
  const uuid = req.params.uuid;
  const submission = await getSubmissionBySubmissionDocument(uuid);

  if (submission) {
    try {
      if (submission.status == env.SENT_STATUS) {
        return res
          .status(422)
          .send({ title: `Submission ${submission.uri} already submitted` });
      } else {
        const { additions, removals } = req.body;
        await submission.update(additions, removals);
        return res.status(204).send();
      }
    } catch (e) {
      console.log(
        `Something went wrong while updating submission with id ${uuid}`
      );
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
app.post('/submission-documents/:uuid/submit', async function (req, res, next) {
  const uuid = req.params.uuid;
  const submission = await getSubmissionBySubmissionDocument(uuid);

  if (submission) {
    try {
      if (submission.status == env.SENT_STATUS) {
        return res
          .status(422)
          .send({ title: `Submission ${submission.uri} already submitted` });
      } else {
        await submission.updateStatus(env.SUBMITABLE_STATUS);
        const newStatus = (await submission.process()).status;
        if (newStatus == env.SENT_STATUS) {
          return res.status(204).send();
        } else {
          return res.status(400).send({ title: 'Unable to submit form' });
        }
      }
    } catch (error) {
      await submission.updateStatus(env.CONCEPT_STATUS);
      console.log(
        `Something went wrong while submitting submission with id ${uuid}`
      );
      console.log(error);
      return next(error);
    }
  } else {
    return res.status(404).send({ title: `Submission ${uuid} not found` });
  }
});
