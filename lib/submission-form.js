import { query, sparqlEscapeString, sparqlEscapeUri, uuid } from 'mu';
import { updateSudo, querySudo } from '@lblod/mu-auth-sudo';
import { FILE_GRAPH, getFileContent, insertTtlFile, updateTtlFile } from './file-helpers';
import { CONCEPT_STATUS, SUBMITABLE_STATUS } from './submission';
import ForkingStore from './forking-store';
import { NamedNode} from 'rdflib';

const ADDITIONS_FILE_TYPE = 'http://data.lblod.gift/concepts/additions-file-type';
const REMOVALS_FILE_TYPE = 'http://data.lblod.gift/concepts/removals-file-type';

export default class SubmissionForm {
  constructor(source, additions, removals) {
    this.source = source || '';
    this.additions = additions || '';
    this.removals = removals || '';
    this.mergedData = this.mergedAdditionsAndRemovals();
  }

  mergedAdditionsAndRemovals(){
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

async function createSubmissionForm({ additions, removals, submission, subject}){
  // create submissionDocument
  const sUuid = uuid();
  const submissionDocumentUri = subject;

  let q = `
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    PREFIX foaf: <http://xmlns.com/foaf/0.1/>
    PREFIX dct: <http://purl.org/dc/terms/>

    INSERT DATA{
       GRAPH <http://mu.semte.ch/application> {
         ${sparqlEscapeUri(submissionDocumentUri)} a ext:SubmissionDocument;
                                                   a foaf:Document.
         ${sparqlEscapeUri(submissionDocumentUri)} mu:uuid ${sparqlEscapeString(sUuid)}.
         ${sparqlEscapeUri(submission)}  dct:subject ${sparqlEscapeUri(submissionDocumentUri)}.
       }
    }
   `;
  console.log(q);
  await query(q);

  //use flow to update form
  await updateSubmissionForm(sUuid, { additions, removals });

  return { uri: submissionDocumentUri, uuid: sUuid };
}

async function updateSubmissionForm(uuid, { additions, removals }) {
  const { submissionDocument, status } = await getSubmissionDocumentById(uuid);

  //sudo world (which should be ok, since user needs to first have the submissionDocument to work on
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
  createSubmissionForm,
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
    await updateSudo(`
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
