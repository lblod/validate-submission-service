import { uuid, sparqlEscapeUri } from 'mu';
import { querySudo, updateSudo } from '@lblod/mu-auth-sudo';
import ForkingStore from 'forking-store';
import { NamedNode } from 'rdflib';
import * as fil from '../automatic-submission-flow-tools/asfFiles.js';
import * as sjp from 'sparqljson-parse';
import * as cts from '../automatic-submission-flow-tools/constants.js';
import * as N3 from 'n3';
const { namedNode } = N3.DataFactory;

const FORM_DATA_FILE_TYPE =
  'http://data.lblod.gift/concepts/form-data-file-type';
const ADDITIONS_FILE_TYPE =
  'http://data.lblod.gift/concepts/additions-file-type';
const REMOVALS_FILE_TYPE = 'http://data.lblod.gift/concepts/removals-file-type';
const META_FILE_TYPE = 'http://data.lblod.gift/concepts/meta-file-type';
const FORM_FILE_TYPE = 'http://data.lblod.gift/concepts/form-file-type';

/**
 * Get form description in TTL format used to construct the form of a submission document.
 *
 * @param {string} submissionDocument URI of the submitted document to get the form description for
 * @return {string} TTL with form description for the given submission document
 */
export function getFormTtl(submissionDocument) {
  return getPartWithoutLogical(submissionDocument, FORM_FILE_TYPE);
}

/**
 * Get the form data to submit as TTL based on the harvested data, additions and removals.
 * Should only be used for submissions that are not yet submitted.
 *
 * @param {string} submissionDocument URI of the submitted document to get the source data for
 * @return {string} TTL with source data for the given submission document
 */
export async function getSourceTtl(submissionDocument) {
  const source = await getHarvestedData(submissionDocument);
  const additions = await getAdditions(submissionDocument);
  const removals = await getRemovals(submissionDocument);

  // merge source, additions and removals
  const forkingStore = new ForkingStore();
  const graph = new NamedNode(`http://merged-form/graph/${uuid()}`);
  forkingStore.loadDataWithAddAndDelGraph(
    source || '',
    graph,
    additions || '',
    removals || '',
    'text/turtle'
  );
  return forkingStore.serializeDataMergedGraph(graph, 'text/turtle');
}

/**
 * Get meta data used to fill in the form of a submission document in TTL format.
 *
 * @param {string} submissionDocument URI of the submitted document to get the meta data for
 * @return {string} TTL with meta data for the given submission document
 */
export function getMetaTtl(submissionDocument) {
  return getPart(submissionDocument, META_FILE_TYPE);
}

/**
 * Update the additions and removals of the given submission document with the given id
 */
export async function updateDocument(
  submissionDocument,
  { additions, removals }
) {
  await saveAdditions(submissionDocument, additions);
  await saveRemovals(submissionDocument, removals);
}

/**
 * Write the form data to a TTL on disk.
 * The TTL will be used to render the form in the frontend.
 */
export async function saveFormTriples(submissionDocument, triples) {
  const nt = triples.map((t) => t.toNT()).join('\n');
  const file = await saveFormData(submissionDocument, nt);
  return file;
}

////////////////////////////////////////////////////////////////////////////////
// Shared with enrich-submission-service
////////////////////////////////////////////////////////////////////////////////

/**
 * Get harvested data of a submission document in TTL format.
 * Only available for submissions that are submitted using the automatic submission API.
 *
 * @param {string} submissionDocument URI of the submitted document to get the harvested data for
 * @return {string} TTL with harvested data for the given submission document
 */
async function getHarvestedData(submissionDocument) {
  const response = await querySudo(`
    PREFIX dct: <http://purl.org/dc/terms/>
    SELECT DISTINCT ?logicalFile
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(submissionDocument)}
          dct:source ?logicalFile .
        ?logicalFile
          dct:type <http://data.lblod.gift/concepts/harvested-data> .
      }
    } LIMIT 1
  `);

  const sparqlJsonParser = new sjp.SparqlJsonParser();
  const parsedResults = sparqlJsonParser.parseJsonResults(response);

  if (parsedResults.length) {
    const file = parsedResults[0].logicalFile;
    return fil.loadFromLogicalFile(file);
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
  const file = await getFileResource(submissionDocument, fileType);
  if (file) return fil.loadFromLogicalFile(file);
}
async function getPartWithoutLogical(submissionDocument, fileType) {
  const file = await getFileResource(submissionDocument, fileType);
  if (file) return fil.loadFromPhysicalFile(file);
}

/**
 * Get the file resource in the triplestore of the given file type that is related to the given submission document
 *
 * @param {string} submissionDocument URI of the submitted document to get the related file for
 * @param {string} fileType URI of the type of the related file
 * @return {namedNode|undefined} File full name (path, name and extention)
 */
async function getFileResource(submissionDocument, fileType) {
  const response = await querySudo(`
    PREFIX dct: <http://purl.org/dc/terms/>
    SELECT DISTINCT ?logicalFile
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(submissionDocument)} dct:source ?logicalFile .
      }
      ?logicalFile dct:type ${sparqlEscapeUri(fileType)} .
    } LIMIT 1
  `);

  const sparqlJsonParser = new sjp.SparqlJsonParser();
  const parsedResults = sparqlJsonParser.parseJsonResults(response);

  if (parsedResults.length) {
    return parsedResults[0].logicalFile;
  } else {
    console.log(
      `Part of type ${fileType} for submission document ${submissionDocument} not found`
    );
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
  const response = await querySudo(`
    PREFIX dct: <http://purl.org/dc/terms/>
    SELECT ?logicalFile
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(submissionDocument)}
          dct:source ?logicalFile .
        ?logicalFile
          dct:type ${sparqlEscapeUri(fileType)} .
      }
    } LIMIT 0
  `);

  const sparqlJsonParser = new sjp.SparqlJsonParser();
  const parsedResults = sparqlJsonParser.parseJsonResults(response);

  if (!parsedResults.length) {
    const graphResponse = await querySudo(`
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
      SELECT ?g WHERE {
        GRAPH ?g {
          ${sparqlEscapeUri(submissionDocument)} a ext:SubmissionDocument .
        }
      } LIMIT 1
    `);
    const graphResults = sparqlJsonParser.parseJsonResults(graphResponse);
    const graph = graphResults[0]?.g;
    const { logicalFile } = await fil.createFromContent(
      content,
      namedNode(cts.SERVICES.enrichSubmission),
      graph
    );
    await updateSudo(`
      PREFIX dct: <http://purl.org/dc/terms/>
      PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(submissionDocument)}
            dct:source ${sparqlEscapeUri(logicalFile.value)} .
          ${sparqlEscapeUri(logicalFile.value)}
            dct:type ${sparqlEscapeUri(fileType)} .
        }
      } WHERE {
        GRAPH ?g {
          ${sparqlEscapeUri(submissionDocument)}
            a ext:SubmissionDocument .
        }
      }
    `);
    return logicalFile.value;
  } else {
    const logicalFile = parsedResults[0].logicalFile;
    await fil.updateContentForLogicalFile(logicalFile, content);
    return logicalFile;
  }
}
