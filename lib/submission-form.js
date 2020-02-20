import { query, sparqlEscapeString, sparqlEscapeUri, uuid } from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { FILE_GRAPH, getFileContent, insertTtlFile, updateTtlFile } from './file-helpers';
import { CONCEPT_STATUS, SUBMITABLE_STATUS } from './submission';
import ForkingStore from './forking-store';
import { NamedNode} from 'rdflib';

const FORM_DATA_FILE_TYPE = 'http://data.lblod.gift/concepts/form-data-file-type';
const ADDITIONS_FILE_TYPE = 'http://data.lblod.gift/concepts/additions-file-type';
const REMOVALS_FILE_TYPE = 'http://data.lblod.gift/concepts/removals-file-type';

export default class SubmissionForm {
  constructor(source, additions, removals) {
    this.source = source;
    this.additions = additions;
    this.removals = removals;
  }

  get mergedData() {
    const forkingStore = new ForkingStore();
    const graph = new NamedNode(`http://merged-form/graph/${uuid()}`);
    forkingStore.loadDataWithAddAndDelGraph(this.source,
                                            graph,
                                            this.additions,
                                            this.removals,
                                            "text/turtle");
    return forkingStore.serializeDataMergedGraph(graph, "text/turtle");
  }
}

/**
 * Get the submission form with the given id.
 * In case the submission is still in concept status, the harvested data (if any),
 * additions and removals are returned.
 * In case the submission is already submitted, the data is retrieved from the triple store.
*/
async function getSubmissionForm(uuid) {
  const { submissionDocument, status } = await getSubmissionDocumentById(uuid);

  if (submissionDocument) {
    console.log('Status of submission document is ' + status);
    if (status == CONCEPT_STATUS || status == SUBMITABLE_STATUS) {
      console.log('Form is in concept status. Getting harvested data and additions/removals');
      const source = await getHarvestedData(submissionDocument);
      const additions = await getAdditions(submissionDocument);
      const removals = await getRemovals(submissionDocument);
      return new SubmissionForm(source, additions, removals);
    } else {
      const source = await getFormData(submissionDocument);
      return new SubmissionForm(source);
    }
  } else {
    throw new Error(`No submission document found for uuid ${uuid}`);
  }
}

/**
 * Create a new submission form with the given URI and attach to the given submission.
*/
async function initializeSubmissionForm({ uri, submission }){
  const sUuid = uuid();

  await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX dct: <http://purl.org/dc/terms/>

    INSERT DATA {
       GRAPH <http://mu.semte.ch/application> {
         ${sparqlEscapeUri(uri)} a ext:SubmissionDocument, foaf:Document ;
                                 mu:uuid ${sparqlEscapeString(sUuid)}.
         ${sparqlEscapeUri(submission)} dct:subject ${sparqlEscapeUri(uri)}.
       }
    }
   `);

  return { uri, uuid: sUuid };
}

/**
 * Update the additions and removals of the submission form with the given id
*/
async function updateSubmissionForm(uuid, { additions, removals }) {
  const { submissionDocument, status } = await getSubmissionDocumentById(uuid);

  // sudo world (which should be ok, since user needs to first have the submissionDocument to work on
  if (submissionDocument) {
    if (status == CONCEPT_STATUS) {
      await saveAdditions(submissionDocument, additions);
      await saveRemovals(submissionDocument, removals);
    } else {
      throw new Error(`Submission document ${uuid} cannot be update because the submission has already been sent.`);
    }
  } else {
    throw new Error(`No submission document found for uuid ${uuid}`);
  }
}

/**
 * Submit a submission form. I.e. write the form data to a TTL on disk.
 * The TTL will be used to render the form in the frontend.
 */
async function submitSubmissionForm(submissionDocument, triples) {
  const nt = triples.map(t => t.toNT()).join('\n');
  const file = await saveFormData(submissionDocument, nt);
}

async function cleanupSubmissionForm(uuid) {
  await querySudo(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    DELETE {
      GRAPH ?g {
        ?submissionDocument dct:hasPart ?file .
      }
      GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
        ?file dct:type ?fileType ;
              ?p ?o .
      }
    }
    WHERE {
      GRAPH ?g {
        ?submissionDocument mu:uuid ${sparqlEscapeString(uuid)} ;
          dct:hasPart ?file .
      }
      GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
        ?file dct:type ?fileType ;
              ?p ?o .
        VALUES ?fileType {
          ${sparqlEscapeUri(ADDITIONS_FILE_TYPE)}
          ${sparqlEscapeUri(REMOVALS_FILE_TYPE)}
        }
      }
    }
  `);
}

export {
  getSubmissionForm,
  initializeSubmissionForm,
  updateSubmissionForm,
  submitSubmissionForm,
  cleanupSubmissionForm
}

/*
 * Private
*/

/**
 * Get the URI of the submission document with the given id and the status of the related submission
 *
 * @param {string} uuid Id of the submission document
 * @return {Object} Object containing the submission document URI and submission status
*/
async function getSubmissionDocumentById(uuid) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX adms: <http://www.w3.org/ns/adms#>

    SELECT ?submissionDocument ?status
    WHERE {
      GRAPH ?g {
        ?submissionDocument mu:uuid ${sparqlEscapeString(uuid)} .
        ?submission dct:subject ?submissionDocument ;
                    adms:status ?status .
      }
    }
  `);

  if (result.results.bindings.length) {
    return {
      submissionDocument: result.results.bindings[0]['submissionDocument'].value,
      status: result.results.bindings[0]['status'].value
    };
  } else {
    return {
      submissionDocument: null,
      status: null
    };
  }
}

/**
 * Get harvested data of a submission document in TTL format.
 * Only available for submissions that are submitted using the automatic submission API.
 *
 * @param {string} submissionDocument URI of the submitted document to get the harvested data for
 * @return {string} TTL with harvested data for the given submission document
*/
async function getHarvestedData(submissionDocument) {
  const result = await query(`
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?ttlFile
    WHERE {
      GRAPH ?g {
        ?submission dct:subject ${sparqlEscapeUri(submissionDocument)} ;
                    nie:hasPart ?remoteFile .
      }
      GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
        ?localHtmlDownload nie:dataSource ?remoteFile .
        ?ttlFile nie:dataSource ?localHtmlDownload .
      }
    }
  `);

  if (result.results.bindings.length) {
    const file = result.results.bindings[0]['ttlFile'].value;
    return await getFileContent(file);
  } else {
    return null;
  }
}

/**
 * Get submitted form data of a submission document in TTL format.
 * Only available for submissions that have already been submitted.
 *
 * @param {string} submissionDocument URI of the submitted document to get the form data for
 * @return {string} TTL with submitted form data
*/
async function getFormData(submissionDocument) {
  return getPart(submissionDocument, FORM_DATA_FILE_TYPE);
}

/**
 * Get additions on the harvested data of a submission document in TTL format.
 * Additions are created by manually editing a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to get the additions for
 * @return {string} TTL with additions for the given submission document
*/
function getAdditions(submissionDocument) {
  return getPart(submissionDocument, ADDITIONS_FILE_TYPE);
}

/**
 * Get removals on the harvested data of a submission document in TTL format.
 * Removals are created by manually editing a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to get the removals for
 * @return {string} TTL with removals for the given submission document
*/
function getRemovals(submissionDocument) {
  return getPart(submissionDocument, REMOVALS_FILE_TYPE);
}

/**
 * Get the content of a file of the given file type that is related to the given submission document
 *
 * @param {string} submissionDocument URI of the submitted document to get the related file for
 * @param {string} fileType URI of the type of the related file
 * @return {string} Content of the related file
*/
async function getPart(submissionDocument, fileType) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?file
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(submissionDocument)} dct:source ?file .
      }
      GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
        ?file dct:type ${sparqlEscapeUri(fileType)} .
      }
    }
  `);

  if (result.results.bindings.length) {
    const file = result.results.bindings[0]['file'].value;
    return await getFileContent(file);
  } else {
    return null;
  }
}

/**
 * Write the submitted form data of a submission document in TTL format to a file.
 *
 * @param {string} submissionDocument URI of the submitted document to write the additions for
 * @param {string} content Additions on the harvested data in TTL format
*/
function saveFormData(submissionDocument, content) {
  return savePart(submissionDocument, content, FORM_DATA_FILE_TYPE);
}

/**
 * Write additions on the harvested data of a submission document in TTL format to a file.
 * Additions are created by manually editing a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to write the additions for
 * @param {string} content Additions on the harvested data in TTL format
*/
function saveAdditions(submissionDocument, content) {
  return savePart(submissionDocument, content, ADDITIONS_FILE_TYPE);
}

/**
 * Write removals on the harvested data of a submission document in TTL format to a file.
 * Removals are created by manually editing a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to write the removals for
 * @param {string} content Removals on the harvested data in TTL format
*/
function saveRemovals(submissionDocument, content) {
  return savePart(submissionDocument, content, REMOVALS_FILE_TYPE);
}

/**
 * Write the given content to a file of the given file type that is related to the given submission document
 *
 * @param {string} submissionDocument URI of the submitted document to write the related file for
 * @param {string} content Content to write to the file
 * @param {string} fileType URI of the type of the related file
*/
async function savePart(submissionDocument, content, fileType) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?file
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(submissionDocument)} dct:source ?file .
      }
      GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
        ?file dct:type ${sparqlEscapeUri(fileType)} .
      }
    }
  `);

  if (!result.results.bindings.length) {
    const file = await insertTtlFile(content);
    await updateSudo(`
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>

      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(submissionDocument)} dct:source ${sparqlEscapeUri(file)} .
        }
        GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
          ${sparqlEscapeUri(file)} dct:type ${sparqlEscapeUri(fileType)} .
        }
      } WHERE {
        GRAPH ?g {
          ${sparqlEscapeUri(submissionDocument)} a foaf:Document .
        }
      }
    `);
    return file;
  } else {
    const file = result.results.bindings[0]['file'].value;
    await updateTtlFile(file, content);
    return file;
  }
}
