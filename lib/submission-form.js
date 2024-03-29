import { uuid, sparqlEscapeUri } from 'mu';
import { querySudo as query, updateSudo as update} from '@lblod/mu-auth-sudo';
import { getFileContent, insertTtlFile, updateTtlFile } from './file-helpers';
import ForkingStore from 'forking-store';
import { NamedNode} from 'rdflib';

const FORM_DATA_FILE_TYPE = 'http://data.lblod.gift/concepts/form-data-file-type';
const ADDITIONS_FILE_TYPE = 'http://data.lblod.gift/concepts/additions-file-type';
const REMOVALS_FILE_TYPE = 'http://data.lblod.gift/concepts/removals-file-type';
const META_FILE_TYPE = 'http://data.lblod.gift/concepts/meta-file-type';
const FORM_FILE_TYPE = 'http://data.lblod.gift/concepts/form-file-type';

/**
 * Get form description in TTL format used to construct the form of a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to get the form description for
 * @return {string} TTL with form description for the given submission document
 */
function getFormTtl(submissionDocument, graph) {
  return getPart(submissionDocument, FORM_FILE_TYPE, graph);
}

/**
 * Get the form data to submit as TTL based on the harvested data, additions and removals.
 * Should only be used for submissions that are not yet submitted.
 *
 * @param {string} submissionDocument URI of the submitted document to get the source data for
 * @return {string} TTL with source data for the given submission document
*/
async function getSourceTtl(submissionDocument, sumbissionGraph) {
  const source = await getHarvestedData(submissionDocument, sumbissionGraph);
  const additions = await getAdditions(submissionDocument, sumbissionGraph);
  const removals = await getRemovals(submissionDocument, sumbissionGraph);

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
function getMetaTtl(submissionDocument, graph) {
  return getPart(submissionDocument, META_FILE_TYPE, graph);
}

/**
 * Update the additions and removals of the given submission document with the given id
*/
async function updateDocument(submissionDocument, { additions, removals }, graph) {
  await saveAdditions(submissionDocument, additions, graph);
  await saveRemovals(submissionDocument, removals, graph);
}

/**
 * Write the form data to a TTL on disk.
 * The TTL will be used to render the form in the frontend.
 */
async function saveFormTriples(submissionDocument, triples, graph) {
  const nt = triples.map(t => t.toNT()).join('\n');
  return saveFormData(submissionDocument, nt, graph);
}

export {
  getFormTtl,
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
async function getHarvestedData(submissionDocument, graph) {
  const result = await query(`
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT DISTINCT ?physicalFile
    WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${sparqlEscapeUri(submissionDocument)} dct:source ?physicalFile .
        ?physicalFile dct:type <http://data.lblod.gift/concepts/harvested-data> .
      }
    }
  `);

  if (result.results.bindings.length) {
    const file = result.results.bindings[0]['physicalFile'].value;
    return await getFileContent(file);
  }
}

/**
 * Get additions on the harvested data of a submission document in TTL format.
 * Additions are created by manually editing a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to get the additions for
 * @return {string} TTL with additions for the given submission document
*/
function getAdditions(submissionDocument, graph) {
  return getPart(submissionDocument, ADDITIONS_FILE_TYPE, graph);
}

/**
 * Get removals on the harvested data of a submission document in TTL format.
 * Removals are created by manually editing a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to get the removals for
 * @return {string} TTL with removals for the given submission document
*/
function getRemovals(submissionDocument, graph) {
  return getPart(submissionDocument, REMOVALS_FILE_TYPE, graph);
}

/**
 * Get the content of a file of the given file type that is related to the given submission document
 *
 * @param {string} submissionDocument URI of the submitted document to get the related file for
 * @param {string} fileType URI of the type of the related file
 * @return {string} Content of the related file
*/
async function getPart(submissionDocument, fileType, graph) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT DISTINCT ?physicalFile ?logicalFile
    WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${sparqlEscapeUri(submissionDocument)} dct:source ?physicalFile .
        OPTIONAL { ?physicalFile nie:dataSource ?logicalFile . }
      }
      ?physicalFile dct:type ${sparqlEscapeUri(fileType)} .
    }
  `);

  if (result.results.bindings.length) {
    const physicalFile = result.results.bindings[0]?.physicalFile?.value;
    if (physicalFile) return getFileContent(physicalFile); 
  } else {
    console.log(`No file of type ${fileType} found for submission document ${submissionDocument}`);
  }
}

/**
 * Write additions on the harvested data of a submission document in TTL format to a file.
 * Additions are created by manually editing a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to write the additions for
 * @param {string} content Additions on the harvested data in TTL format
*/
function saveAdditions(submissionDocument, content, graph) {
  return savePart(submissionDocument, content, ADDITIONS_FILE_TYPE, graph);
}

/**
 * Write removals on the harvested data of a submission document in TTL format to a file.
 * Removals are created by manually editing a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to write the removals for
 * @param {string} content Removals on the harvested data in TTL format
*/
function saveRemovals(submissionDocument, content, graph) {
  return savePart(submissionDocument, content, REMOVALS_FILE_TYPE, graph);
}

/**
 * Write the submitted form data of a submission document in TTL format to a file.
 *
 * @param {string} submissionDocument URI of the submitted document to write the additions for
 * @param {string} content Additions on the harvested data in TTL format
*/
function saveFormData(submissionDocument, content, graph) {
  return savePart(submissionDocument, content, FORM_DATA_FILE_TYPE, graph);
}

/**
 * Write the given content to a file of the given file type that is related to the given submission document
 *
 * @param {string} submissionDocument URI of the submitted document to write the related file for
 * @param {string} content Content to write to the file
 * @param {string} fileType URI of the type of the related file
*/
async function savePart(submissionDocument, content, fileType, graph) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT DISTINCT ?logicalFile ?physicalFile
    WHERE {
      GRAPH ${sparqlEscapeUri(graph)} {
        ${sparqlEscapeUri(submissionDocument)} dct:source ?physicalFile .
        ?physicalFile
          nie:dataSource ?logicalFile ;
          dct:type ${sparqlEscapeUri(fileType)} .
      }
    }
  `);

  if (!result.results.bindings.length) {
    const { logicalFile, physicalFile } = await insertTtlFile(submissionDocument, content, graph);
    await update(`
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>

      INSERT {
        GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(submissionDocument)} dct:source ${sparqlEscapeUri(physicalFile)} .
          ${sparqlEscapeUri(logicalFile)} dct:type ${sparqlEscapeUri(fileType)} .
          ${sparqlEscapeUri(physicalFile)} dct:type ${sparqlEscapeUri(fileType)} .
        }
      } WHERE {
        GRAPH ${sparqlEscapeUri(graph)} {
          ${sparqlEscapeUri(submissionDocument)} a ext:SubmissionDocument .
        }
      }
    `);
    return { logicalFile, physicalFile };
  } else {
    const logicalFile = result.results.bindings[0]['logicalFile'].value;
    const physicalFile = result.results.bindings[0]['physicalFile'].value;
    await updateTtlFile(submissionDocument, logicalFile, content, graph);
    return { logicalFile, physicalFile };
  }
}
