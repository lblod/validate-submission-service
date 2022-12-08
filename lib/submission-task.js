import * as mu from 'mu';
import * as mas from '@lblod/mu-auth-sudo';
import * as env from '../env.js';

/**
 * Updates the state of the given task to the specified status with potential error message or resultcontainer file
 *
 * @param string taskUri URI of the task
 * @param string status URI of the new status
 * @param string or undefined URI of the error that needs to be attached
*/
export async function updateTaskStatus(taskUri, status, errorUri, extraStatus, logicalFileUri, graph) {
  const taskUriSparql = mu.sparqlEscapeUri(taskUri);
  const nowSparql = mu.sparqlEscapeDateTime((new Date()).toISOString());
  const hasError = errorUri && status === env.TASK_FAILURE_STATUS;

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

  const statusUpdateQuery = `
    ${env.PREFIXES}
    DELETE {
      GRAPH ${mu.sparqlEscapeUri(graph)} {
        ${taskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
    INSERT {
      GRAPH ${mu.sparqlEscapeUri(graph)} {
        ${taskUriSparql}
          adms:status ${mu.sparqlEscapeUri(status)} ;
          ${resultContainerUuid ? `task:resultsContainer asj:${resultContainerUuid} ;` : ''}
          ${hasError ? `task:error ${mu.sparqlEscapeUri(errorUri)} ;` : ''}
          dct:modified ${nowSparql} .

        ${(status === env.TASK_SUCCESS_STATUS && extraStatus) ? `?inputContainer ext:additionalStatus ${mu.sparqlEscapeUri(extraStatus)} .` : ''}

        ${resultContainerTriples}
      }
    }
    WHERE {
      GRAPH ${mu.sparqlEscapeUri(graph)} {
        ${taskUriSparql}
          adms:status ?oldStatus ;
          dct:modified ?oldModified .
      }
    }
  `;
  await mas.updateSudo(statusUpdateQuery);
}

export async function getOrganisationIdFromTask(taskUri) {
  const response = await mas.querySudo(`
    ${env.PREFIXES}
    SELECT DISTINCT ?organisationId WHERE {
      ${mu.sparqlEscapeUri(taskUri)} dct:isPartOf ?job .
      ?job prov:generated ?submission .
      ?submission pav:createdBy ?bestuurseenheid .
      ?bestuurseenheid mu:uuid ?organisationId .
    }
    LIMIT 1
  `);
  return response?.results?.bindings[0]?.organisationId?.value;
}
