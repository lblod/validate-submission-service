import { query, update, sparqlEscapeString, sparqlEscapeUri } from 'mu';
import { FILE_GRAPH, getFileContent, insertTtlFile, updateTtlFile } from './file-helpers';
import { CONCEPT_STATUS } from './submission';

const ADDITIONS_FILE_TYPE = 'http://data.lblod.gift/concepts/additions-file-type';
const REMOVALS_FILE_TYPE = 'http://data.lblod.gift/concepts/removals-file-type';

export default class SubmissionForm {
  constructor(source, additions, removals) {
    this.source = source;
    this.additions = additions;
    this.removals = removals;
  }
}

async function getSubmissionForm(uuid) {
  const { submissionDocument, status } = await getSubmissionDocumentById(uuid);

  if (submissionDocument) {
    console.log('Status of submission document is ' + status);
    if (status == CONCEPT_STATUS) {
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

async function updateSubmissionForm(uuid, { additions, removals }) {
  const { submissionDocument, status } = await getSubmissionDocumentById(uuid);

  if (submissionDocument) {
    if (status != CONCEPT_STATUS) {
      const additions = await saveAdditions(submissionDocument, additions);
      const removals = await saveRemovals(submissionDocument, removals);
    } else {
      throw new Error(`Submission document ${uuid} cannot be update because the submission has already been sent.`);
    }
  } else {
    throw new Error(`No submission document found for uuid ${uuid}`);
  }
}

async function cleanupSubmissionForm(uuid) {
  await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    DELETE {
      GRAPH ?g {
        ?submissionDocument dct:hasPart ?file .
      }
      GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
        ?file ?p ?o .
      }
    }
    WHERE {
      GRAPH ?g {
        ?submissionDocument mu:uuid ${sparqlEscapeString(uuid)} ;
          dct:hasPart ?file .
      }
      GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
        ?file ?p ?o .
      }
    }
  `);
}

export {
  getSubmissionForm,
  updateSubmissionForm,
  cleanupSubmissionForm
}

/*
 * Private
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

  console.log(JSON.stringify(result));
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

async function getFormData(submissionDocument) {
  const result = await query(`
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>

    SELECT ?file
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(submissionDocument)} dct:source ?file .
      }
      GRAPH ${sparqlEscapeUri(FILE_GRAPH)} {
        ?file a melding:SubmittedFormData .
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

function getAdditions(submissionDocument) {
  return getPart(submissionDocument, ADDITIONS_FILE_TYPE);
}

function getRemovals(submissionDocument) {
  return getPart(submissionDocument, REMOVALS_FILE_TYPE);
}

async function getPart(submissionDocument, fileType) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?file
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(submissionDocument)} dct:hasPart ?file .
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

function saveAdditions(submissionDocument, content) {
  return savePart(submissionDocument, content, ADDITIONS_FILE_TYPE);
}

function saveRemovals(submissionDocument, content) {
  return savePart(submissionDocument, content, REMOVALS_FILE_TYPE);
}

async function savePart(submissionDocument, content, fileType) {
  const result = await query(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>

    SELECT ?file
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(submissionDocument)} dct:hasPart ?file .
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
      PREFIX foaf: <http://xmlns.com/foaf/0.1/>

      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(submissionDocument)} dct:hasPart ${sparqlEscapeUri(file)} .
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
  } else {
    const file = result.results.bindings[0]['file'].value;
    await updateTtlFile(file, content);
  }

}
