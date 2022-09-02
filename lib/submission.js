import { sparqlEscapeUri, sparqlEscapeString, sparqlEscapeDateTime } from 'mu';
import { querySudo as query, updateSudo as update } from '@lblod/mu-auth-sudo';
import FormBuilder from './form-builder';
import { getFormTtl, getSourceTtl, getMetaTtl, updateDocument, saveFormTriples } from './submission-form';
import fs from 'fs';
import { RemoteDataObject } from './remote-data-object';
import * as env from '../env.js';

const CONCEPT_STATUS = 'http://lblod.data.gift/concepts/79a52da4-f491-4e2f-9374-89a13cde8ecd';
const SUBMITABLE_STATUS = 'http://lblod.data.gift/concepts/f6330856-e261-430f-b949-8e510d20d0ff';
const SENT_STATUS = 'http://lblod.data.gift/concepts/9bd8d86d-bb10-4456-a84e-91e9507c374c';

class Submission {
  constructor({uri, status, submittedResource}) {
    this.uri = uri;
    this.status = status;
    this.submittedResource = submittedResource; // submission document
  }

  async updateStatus(status) {
    await update(`
      PREFIX adms: <http://www.w3.org/ns/adms#>

      DELETE {
        GRAPH ?g {
          ${sparqlEscapeUri(this.uri)} adms:status ?status .
        }
      }
      INSERT {
        GRAPH ?g {
          ${sparqlEscapeUri(this.uri)} adms:status ${sparqlEscapeUri(status)} .
        }
      } WHERE {
        GRAPH ?g {
          ${sparqlEscapeUri(this.uri)} adms:status ?status .
        }
      }
    `);
  }

  /**
   * Updates the additions and removals and processes the form
   */
  async update({additions, removals}) {
    await updateDocument(this.submittedResource, {additions, removals});
    await this.process();
  }

  /**
   * Tries processing the meb:Submission, returns SENT_STATUS or CONCEPT_STATUS
   */
  async process() {
    try {
      const formTtl = await getFormTtl(this.submittedResource);
      const metaTtl = await getMetaTtl(this.submittedResource);
      const sourceTtl = await getSourceTtl(this.submittedResource);
      const formBuilder = new FormBuilder({submittedResource: this.submittedResource, formTtl, sourceTtl, metaTtl});
      const triples = formBuilder.build().data();

      if (!triples.length) {
        console.log(
            `No form data could be filled in. Nothing harvested for submission <${this.uri}> with submitted resource <${this.submittedResource}>`);
      }

      const isValid = formBuilder.validate();
      console.log(`Form for submitted resource ${this.submittedResource} is valid: ${isValid}`);

      const currentStatus = await getSubmissionStatus(this.uri);
      if (!currentStatus)
        throw new Error(`Submission <${this.uri}> doesn't have a status`);

      let targetStatus = null;

      if (currentStatus === SUBMITABLE_STATUS) {
        if (!isValid) {
          console.log(`Resetting status of submission ${this.uri} to concept since it's invalid`);
          targetStatus = CONCEPT_STATUS;
        } else {
          console.log(`Updating status of submission ${this.uri} to sent state since it's valid`);
          await this.submit(formBuilder.form.value, triples);
          // NOTE find and save/update remote-data-objects
          await RemoteDataObject.process(triples);
          targetStatus = SENT_STATUS;
        }
      }

      const logicalFileUri = await saveFormTriples(this.submittedResource, triples);

      if (targetStatus) {
        await this.updateStatus(targetStatus);
      }

      return { status: targetStatus == null ? currentStatus : targetStatus, logicalFileUri };
    } catch (e) {
      console.log(`Something went wrong while processing submission ${this.uri}`);
      console.log(e);
      throw e;
    }
  }

  /**
   * Submit a valid submission
   * - keep a reference to the form used to fill in form
   */
  async submit(formUri, triples) {
    try {
      const timestamp = new Date();
      const q = `
          PREFIX meb: <http://rdf.myexperiment.org/ontologies/base/>
          PREFIX prov: <http://www.w3.org/ns/prov#>
          PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>

          INSERT {
            GRAPH ?g {
              ${sparqlEscapeUri(this.uri)} prov:used ${sparqlEscapeUri(formUri)} ;
                                        nmo:sentDate ${sparqlEscapeDateTime(timestamp)} .
            }
          } WHERE {
            GRAPH ?g {
              ${sparqlEscapeUri(this.uri)} a meb:Submission .
            }
          }
        `;
      await update(q);
    } catch (e) {
      console.log(`Something went wrong while submitting submission ${this.uri}`);
      console.log(e);
      throw e;
    }
  }
}

async function getSubmissionByTask(taskUri) {
  const response = await query(`
    ${env.PREFIXES}
    SELECT ?submission ?submissionDocument ?status
    WHERE {
      GRAPH ?g {
        ${sparqlEscapeUri(taskUri)}
          a task:Task ;
          dct:isPartOf ?job .
        ?job prov:generated ?submission .
        ?submission
          dct:subject ?submissionDocument ;
          adms:status ?status .
      }
    } LIMIT 1
  `);

  const bindings = response?.results?.bindings;
  if (bindings && bindings.length > 0) {
    const binding = bindings[0];
    return new Submission({
      uri: binding.submission.value,
      status: binding.status.value,
      submittedResource: binding.submissionDocument.value
    });
  }
}

async function getSubmissionBySubmissionDocument(uuid) {
  const result = await query(`
    PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
    PREFIX prov: <http://www.w3.org/ns/prov#>
    PREFIX melding: <http://lblod.data.gift/vocabularies/automatische-melding/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>

    SELECT ?submission ?submissionDocument ?status
    WHERE {
      GRAPH ?g {
        ?submissionDocument mu:uuid ${sparqlEscapeString(uuid)} .
        ?submission dct:subject ?submissionDocument ;
                    adms:status ?status .
      }
    } LIMIT 1
  `);

  if (result.results.bindings.length) {
    const binding = result.results.bindings[0];
    return new Submission({
      uri: binding['submission'].value,
      status: binding['status'].value,
      submittedResource: binding['submissionDocument'].value
    });
  } else {
    return null;
  }
}

async function getSubmissionStatus(submissionUri) {
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
};

