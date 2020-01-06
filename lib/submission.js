import { sparqlEscapeUri } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import FormBuilder from './form-builder';
import { TASK_SUCCESS_STATUS, TASK_FAILURE_STATUS, updateTaskStatus } from './submission-task';

const CONCEPT_STATUS = 'http://lblod.data.gift/concepts/79a52da4-f491-4e2f-9374-89a13cde8ecd';
const SUBMITABLE_STATUS = 'http://lblod.data.gift/concepts/f6330856-e261-430f-b949-8e510d20d0ff';
const SENT_STATUS = 'http://lblod.data.gift/concepts/9bd8d86d-bb10-4456-a84e-91e9507c374c';

class Submission {
  constructor(submission, submittedResource, ttlFile, task) {
    this.submission = submission;
    this.submittedResource = submittedResource,
    this.ttlFile = ttlFile; // URI of TTL file with harvested triples
    this.task = task;
  }

  async process() {
    try {
      const formBuilder = new FormBuilder(this.ttlFile, this.submittedResource);
      const triples = formBuilder.build().data();

      if (triples.length) {
        await this.importInStore(triples);
      } else {
        console.log(`No form data could be filled in. Nothing harvested for submission <${this.submission}> with submitted resource <${this.submittedResource}>`);
      }

      const isValid = formBuilder.validate();
      console.log(`Form for submitted resource ${this.submittedResource} is valid: ${isValid}`);
      await this.finalizeStatus(isValid);

      await updateTaskStatus(this.task, TASK_SUCCESS_STATUS);
    } catch (e) {
      console.log(`Something went wrong while processing submission ${this.submission}`);
      console.log(e);
      await updateTaskStatus(this.task, TASK_FAILURE_STATUS);
    }
  }

  async importInStore(triples) {
    const nt = triples.map(t => t.toNT()).join('\n');
    await update(`
          INSERT {
            GRAPH ?g {
              ${nt}
            }
          } WHERE {
            GRAPH ?g {
              ${sparqlEscapeUri(this.submittedResource)} a foaf:Document .
            }
          }
        `);
  }

  async finalizeStatus(isValid) {
    const result = await query(`
      PREFIX adms: <http://www.w3.org/ns/adms#>

      SELECT ?status
      WHERE { ${sparqlEscapeUri(this.submission)} adms:status ?status . }
      LIMIT 1
    `);

    if (result.results.bindings.length) {
      const currentStatus = result.results.bindings[0]['status'].value;

      let status = null;
      if (currentStatus == SUBMITABLE_STATUS) {
        if (!isValid) {
          console.log(`Resetting status of submission ${this.submission} to concept since it's invalid`);
          status = CONCEPT_STATUS;
        } else {
          console.log(`Automatically updating status of submission ${this.submission} to sent state since it's valid`);
          status = SENT_STATUS;
        }
      }
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
    return new Submission(
      binding['submission'].value,
      binding['submittedResource'].value,
      binding['ttlFile'].value,
      taskUri
    );
  } else {
    return null;
  }
}

export default Submission;
export {
  getSubmissionByTask
}
