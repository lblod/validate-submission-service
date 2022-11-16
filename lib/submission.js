import { sparqlEscapeUri, sparqlEscapeDateTime } from 'mu';
import { updateSudo as update } from '@lblod/mu-auth-sudo';
import FormBuilder from './form-builder';
import {
  getFormTtl,
  getSourceTtl,
  getMetaTtl,
  updateDocument,
  saveFormTriples,
} from './submission-form';
import { RemoteDataObject } from './remote-data-object';
import * as env from '../env.js';
import * as cts from '../automatic-submission-flow-tools/constants.js';
import * as smt from '../automatic-submission-flow-tools/asfSubmissions.js';
import * as N3 from 'n3';
const { namedNode, literal } = N3.DataFactory;

export default class Submission {
  constructor(uri, status, submittedResource) {
    this.uri = uri;
    this.status = status;
    this.submittedResource = submittedResource; // submission document
  }

  async updateStatus(status) {
    await update(`
      ${cts.SPARQL_PREFIXES}
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
  async update(additions, removals) {
    await updateDocument(this.submittedResource, { additions, removals });
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
      const formBuilder = new FormBuilder(
        this.submittedResource,
        formTtl,
        sourceTtl,
        metaTtl
      );
      const triples = formBuilder.build().data();

      if (!triples.length) {
        console.log(
          `No form data could be filled in. Nothing harvested for submission <${this.uri}> with submitted resource <${this.submittedResource}>`
        );
      }

      const isValid = formBuilder.validate();
      console.log(
        `Form for submitted resource ${this.submittedResource} is valid: ${isValid}`
      );

      const submissionInfo = await smt.getSubmissionInfo(namedNode(this.uri));
      const currentStatus = submissionInfo?.status?.value;
      if (!currentStatus)
        throw new Error(`Submission <${this.uri}> doesn't have a status`);

      let targetStatus = null;

      if (currentStatus === env.SUBMITABLE_STATUS) {
        if (!isValid) {
          console.log(
            `Resetting status of submission ${this.uri} to concept since it's invalid`
          );
          targetStatus = env.CONCEPT_STATUS;
        } else {
          console.log(
            `Updating status of submission ${this.uri} to sent state since it's valid`
          );
          await this.submit(formBuilder.form.value, triples);
          // NOTE find and save/update remote-data-objects
          await RemoteDataObject.process(triples);
          targetStatus = env.SENT_STATUS;
        }
      }

      const logicalFileUri = await saveFormTriples(
        this.submittedResource,
        triples
      );

      if (targetStatus) {
        await this.updateStatus(targetStatus);
      }

      return {
        status: targetStatus == null ? currentStatus : targetStatus,
        logicalFileUri,
      };
    } catch (e) {
      console.log(
        `Something went wrong while processing submission ${this.uri}`
      );
      console.log(e);
      throw e;
    }
  }

  /**
   * Submit a valid submission
   * - keep a reference to the form used to fill in form
   */
  async submit(formUri) {
    try {
      const timestamp = new Date();
      const q = `
        PREFIX meb: <http://rdf.myexperiment.org/ontologies/base/>
        PREFIX prov: <http://www.w3.org/ns/prov#>
        PREFIX nmo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#>

        INSERT {
          GRAPH ?g {
            ${sparqlEscapeUri(this.uri)}
              prov:used ${sparqlEscapeUri(formUri)} ;
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
      console.log(
        `Something went wrong while submitting submission ${this.uri}`
      );
      console.log(e);
      throw e;
    }
  }
}

export async function getSubmissionByTask(taskUri) {
  const submissionInfo = await smt.getSubmissionInfoFromTask(
    namedNode(taskUri)
  );
  if (submissionInfo)
    return new Submission(
      submissionInfo.submission.value,
      submissionInfo.status.value,
      submissionInfo.submittedDocument.value
    );
}

export async function getSubmissionBySubmissionDocument(uuid) {
  const submissionInfo = await smt.getSubmissionInfoFromSubmissionDocumentId(
    literal(uuid)
  );
  if (submissionInfo)
    return new Submission(
      submissionInfo.submission.value,
      submissionInfo.status.value,
      submissionInfo.submittedDocument.value
    );
}
