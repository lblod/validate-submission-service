import { sparqlEscapeUri, sparqlEscapeString } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import FormBuilder from './form-builder';
import { insertTtlFile } from './file-helpers';

const CONCEPT_STATUS = 'http://lblod.data.gift/concepts/79a52da4-f491-4e2f-9374-89a13cde8ecd';
const SUBMITABLE_STATUS = 'http://lblod.data.gift/concepts/f6330856-e261-430f-b949-8e510d20d0ff';
const SENT_STATUS = 'http://lblod.data.gift/concepts/9bd8d86d-bb10-4456-a84e-91e9507c374c';

class Submission {
  constructor({ submission, submittedResource, fileUri, ttl }) {
    this.submission = submission; // TOOD rename to 'uri'
    this.submittedResource = submittedResource;
    this.fileUri = fileUri; // URI of TTL file with harvested triples
    this.ttl = ttl; // TTL content (instead of passing a file URI)
  }

  async updateStatus(status) {
    await update(`
      PREFIX adms: <http://www.w3.org/ns/adms#>

      DELETE {
        GRAPH ?g {
          ${sparqlEscapeUri(this.submission)} adms:status ?status .
        }
      }
      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(this.submission)} adms:status ${sparqlEscapeUri(status)} .
        }
      } WHERE {
        GRAPH ?g {
          ${sparqlEscapeUri(this.submission)} adms:status ?status .
        }
      }
    `);
  }

  async process() {
    try {
      const formBuilder = new FormBuilder({ submittedResource: this.submittedResource, fileUri: this.fileUri, ttl: this.ttl });
      const triples = formBuilder.build().data();

      if (!triples.length) {
        console.log(`No form data could be filled in. Nothing harvested for submission <${this.submission}> with submitted resource <${this.submittedResource}>`);
      }

      const isValid = formBuilder.validate();
      console.log(`Form for submitted resource ${this.submittedResource} is valid: ${isValid}`);
      return await this.submit(triples, isValid);
    } catch (e) {
      console.log(`Something went wrong while processing submission ${this.submission}`);
      console.log(e);
      throw e;
    }
  }

  async submit(triples, isValid) {
    const currentStatus = await getSubmissionStatus(this.submission);

    let targetStatus = null;
    if (currentStatus) {
      if (currentStatus == SUBMITABLE_STATUS) {
        if (!isValid) {
          console.log(`Resetting status of submission ${this.submission} to concept since it's invalid`);
          targetStatus = CONCEPT_STATUS;
        } else {
          console.log(`Updating status of submission ${this.submission} to sent state since it's valid`);
          await this.writeFormDataToFile(triples);
          targetStatus = SENT_STATUS;
        }
      }

      if (targetStatus)
        await this.updateStatus(targetStatus);

      return targetStatus == null ? currentStatus : targetStatus;
    } else {
      throw new Error(`Submission <${this.submission}> doesn't have a status`);
    }
  }

  async writeFormDataToFile(triples) {
    const nt = triples.map(t => t.toNT()).join('\n');
    const file = await insertTtlFile(nt);

    await update(`
          PREFIX foaf: <http://xmlns.com/foaf/0.1/>
          PREFIX dct: <http://purl.org/dc/terms/>
          PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
          PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>

          INSERT {
            GRAPH ?fileGraph {
              ${sparqlEscapeUri(file)} a melding:SubmittedFormData .
            }
            GRAPH ?g {
              ${sparqlEscapeUri(this.submittedResource)} dct:source ${sparqlEscapeUri(file)} .
            }
          } WHERE {
            GRAPH ?fileGraph {
              ${sparqlEscapeUri(file)} a nfo:FileDataObject .
            }
            GRAPH ?g {
              ${sparqlEscapeUri(this.submittedResource)} a foaf:Document .
            }
          }
        `);
  }
}

async function getSubmissionByTask(taskUri) {
  const q = `
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dct: <http://purl.org/dc/terms/>

    SELECT ?submission ?ttlFile ?submittedResource
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)} prov:generated ?submission ;
           a melding:AutomaticSubmissionTask .
        ?submission dct:subject ?submittedResource ;
           nie:hasPart ?remoteFile .
      }
      GRAPH ?fileGraph {
        ?localHtmlFile nie:dataSource ?remoteFile .
        ?ttlFile nie:dataSource ?localHtmlFile .
      }
    } LIMIT 1
  `;

  const result = await query(q);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return new Submission({
      submission: binding['submission'].value,
      submittedResource: binding['submittedResource'].value,
      fileUri: binding['ttlFile'].value
    });
  } else {
    return null;
  }
}

async function getSubmissionBySubmissionDocument(uuid) {
  const q = `
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?submission ?submittedResource
    WHERE {
      GRAPH ?g {
        ?submittedResource mu:uuid ${sparqlEscapeString(uuid)} .
        ?submission dct:subject ?submittedResource.
      }
    } LIMIT 1
  `;

  const result = await query(q);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return new Submission({
      submission: binding['submission'].value,
      submittedResource: binding['submittedResource'].value,
    });
  } else {
    return null;
  }
}

async function getSubmissionStatus(submissionUri){
  const result = await query(`
  PREFIX adms: <http://www.w3.org/ns/adms#>

  SELECT ?status
  WHERE { ${sparqlEscapeUri(submissionUri)} adms:status ?status . }
  LIMIT 1
`);

  if (result.results.bindings.length) {
    return result.results.bindings[0]['status'].value;
  } else {
    return null;
  }
}

export default Submission;
export {
  getSubmissionStatus,
  getSubmissionByTask,
  getSubmissionBySubmissionDocument,
  CONCEPT_STATUS, SUBMITABLE_STATUS, SENT_STATUS
}
