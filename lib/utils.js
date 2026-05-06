import * as mas from '@lblod/mu-auth-sudo';
import * as mu from 'mu';
import * as env from '../env.js';

export async function saveError({ message, detail, reference }) {
  if (!message) throw 'Error needs a message describing what went wrong.';
  const id = mu.uuid();
  const uri = `http://data.lblod.info/errors/${id}`;
  const q = `
    PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
    PREFIX oslc: <http://open-services.net/ns/core#>
    PREFIX dct:  <http://purl.org/dc/terms/>
    PREFIX xsd:  <http://www.w3.org/2001/XMLSchema#>

    INSERT DATA {
      GRAPH <http://mu.semte.ch/graphs/error> {
        ${mu.sparqlEscapeUri(uri)}
          a oslc:Error ;
          mu:uuid ${mu.sparqlEscapeString(id)} ;
          dct:subject ${mu.sparqlEscapeString('Validate Submission Service')} ;
          oslc:message ${mu.sparqlEscapeString(message)} ;
          dct:created ${mu.sparqlEscapeDateTime(new Date().toISOString())} ;
          ${reference ? `dct:references ${mu.sparqlEscapeUri(reference)} ;` : ''}
          ${detail ? `oslc:largePreview ${mu.sparqlEscapeString(detail)} ;` : ''}
          dct:creator ${mu.sparqlEscapeUri(env.CREATOR)} .
      }
    }
   `;
  try {
    await mas.updateSudo(q);
    return uri;
  } catch (e) {
    console.warn(
      `[WARN] Something went wrong while trying to store an error.\nMessage: ${e}\nQuery: ${q}`,
    );
  }
}

export async function isCrossReferencingParentType(documentType) {
  const response = await mas.querySudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    ASK {
      BIND (${mu.sparqlEscapeUri(documentType)} AS ?referrerDecisionType)
      ?referrerDecisionType ext:can_refer_to | ext:without_relevant_CKB_can_refer_to ?referredDecisionType .
    }`);
  return response.boolean;
}

export async function getCrossReferencingChildType(
  referrerDecisionType,
  withCKB,
) {
  const predicate = withCKB
    ? 'ext:can_refer_to'
    : 'ext:without_relevant_CKB_can_refer_to';
  const response = await mas.querySudo(`
    PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
    SELECT DISTINCT ?referredDecisionType
    WHERE {
      BIND (${mu.sparqlEscapeUri(referrerDecisionType)} AS ?referrerDecisionType)
      ?referrerDecisionType ${predicate} ?referredDecisionType .
    }
    LIMIT 1
  `);
  if (response?.results?.bindings?.length) {
    return response.results.bindings[0].referredDecisionType.value;
  }
}
