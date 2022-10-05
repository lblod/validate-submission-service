import * as mu from 'mu';
import * as mas from '@lblod/mu-auth-sudo';
import * as cts from '../automatic-submission-flow-tools/constants.js';

/**
 * Updates the state of the given task to the specified status with potential error message or resultcontainer file
 *
 * @param string taskUri URI of the task
 * @param string status URI of the new status
 * @param string or undefined URI of the error that needs to be attached
 */
export async function updateTaskStatus(
  taskUri,
  status,
  errorUri,
  extraStatus,
  logicalFileUri
) {
  const taskUriSparql = mu.sparqlEscapeUri(taskUri);
  const nowSparql = mu.sparqlEscapeDateTime(new Date().toISOString());
  const hasError = errorUri && status === cts.TASK_STATUSES.failed;

  let resultContainerTriples = '';
  let resultContainerUuid = '';
  if (logicalFileUri) {
    resultContainerUuid = mu.uuid();
    resultContainerTriples = `
      asj:${resultContainerUuid}
        a nfo:DataContainer ;
        mu:uuid ${mu.sparqlEscapeString(resultContainerUuid)} ;
        task:hasFile ${mu.sparqlEscapeUri(logicalFileUri)} .
    `;
  }
  const resultsContainerLink = resultContainerUuid
    ? `task:resultsContainer asj:${resultContainerUuid} ;`
    : '';

  //TODO This triple does not do anything? Where is inputContainer defined?
  //Searched through toezicht-flattened-form-data-generator, and could not find ext:additionalStatus anywhere, so this can be removed later.
  const extraStatusTriple =
    status === cts.TASK_SUCCESS_STATUS.success && extraStatus
      ? '?inputContainer ext:additionalStatus ' +
        mu.sparqlEscapeUri(extraStatus) +
        ' .'
      : '';

  const statusUpdateQuery = `
    ${cts.SPARQL_PREFIXES}
    DELETE {
      GRAPH ?g {
        ${taskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ?g {
        ${taskUriSparql}
          adms:status ${mu.sparqlEscapeUri(status)} ;
          ${resultsContainerLink}
          ${hasError ? `task:error ${mu.sparqlEscapeUri(errorUri)} ;` : ''}
          dct:modified ${nowSparql} .

        ${extraStatusTriple}

        ${resultContainerTriples}
      }
    }
    WHERE {
      GRAPH ?g {
        ${taskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
  `;
  await mas.updateSudo(statusUpdateQuery);
}
