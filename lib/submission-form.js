import { sparqlEscapeString, sparqlEscapeUri, uuid } from 'mu';
import { querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import { FILE_GRAPH, getFileContent, insertTtlFile, updateTtlFile } from './file-helpers';
import ForkingStore from 'forking-store';
import { NamedNode} from 'rdflib';
import { CONCEPT_STATUS } from './submission';

const FORM_DATA_FILE_TYPE = 'http://data.lblod.gift/concepts/form-data-file-type';
const ADDITIONS_FILE_TYPE = 'http://data.lblod.gift/concepts/additions-file-type';
const REMOVALS_FILE_TYPE = 'http://data.lblod.gift/concepts/removals-file-type';
const META_FILE_TYPE = 'http://data.lblod.gift/concepts/meta-file-type';
const FORM_FILE_TYPE = 'http://data.lblod.gift/concepts/form-file-type';

/**
 * Get the form data to submit as TTL based on the harvested data, additions and removals.
 * Should only be used for submissions that are not yet submitted.
 *
 * @param {string} submissionDocument URI of the submitted document to get the source data for
 * @return {string} TTL with source data for the given submission document
*/
async function getSourceTtl(submissionDocument) {
  const source = await getHarvestedData(submissionDocument);
  const additions = await getAdditions(submissionDocument);
  const removals = await getRemovals(submissionDocument);

  // merge source, additions and removals
  const forkingStore = new ForkingStore();
  const graph = new NamedNode(`http://merged-form/graph/${uuid()}`);
  forkingStore.loadDataWithAddAndDelGraph(source || '', graph, additions || '', removals || '', 'text/turtle');
  return forkingStore.serializeDataMergedGraph(graph, 'text/turtle');
}

/**
 * Get meta data used to fill in the form of a submission document in TTL format.
 *
 * @param {string} submissionDocument URI of the submitted document to get the meta data for
 * @return {string} TTL with meta data for the given submission document
*/
function getMetaTtl(submissionDocument) {
  return getPart(submissionDocument, META_FILE_TYPE);
}

/**
 * Update the additions and removals of the given submission document with the given id
*/
async function updateDocument(submissionDocument, { additions, removals }) {
  await saveAdditions(submissionDocument, additions);
  await saveRemovals(submissionDocument, removals);
}

/**
 * Write the form data to a TTL on disk.
 * The TTL will be used to render the form in the frontend.
 */
async function saveFormTriples(submissionDocument, triples) {
  const nt = triples.map(t => t.toNT()).join('\n');
  const file = await saveFormData(submissionDocument, nt);
}

export {
  getSourceTtl,
  getMetaTtl,
  updateDocument,
  saveFormTriples
}

/*
 * Private
*/

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
 * Write the submitted form data of a submission document in TTL format to a file.
 *
 * @param {string} submissionDocument URI of the submitted document to write the additions for
 * @param {string} content Additions on the harvested data in TTL format
*/
function saveFormData(submissionDocument, content) {
  return savePart(submissionDocument, content, FORM_DATA_FILE_TYPE);
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
    await update(`
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(submissionDocument)} dct:source ${sparqlEscapeUri(file)} .
        }
        GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
          ${sparqlEscapeUri(file)} dct:type ${sparqlEscapeUri(fileType)} .
        }
      } WHERE {
        GRAPH ?g {
          ${sparqlEscapeUri(submissionDocument)} a ext:SubmissionDocument .
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
