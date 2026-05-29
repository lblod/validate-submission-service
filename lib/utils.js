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
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>    
    PREFIX ref: <http://lblod.data.gift/vocabularies/referencing/>

    ASK {
      ?rule
        rdf:type ref:ReferencingRule ;
        rdfs:domain ${mu.sparqlEscapeUri(documentType)} .
    }`);

  return response.boolean;
}

export async function getCrossReferencingChildType(
  referrerDecisionType,
  withCKB,
) {
  let response;
  if (withCKB) {
    response = await mas.querySudo(`
      PREFIX lblodBesluit: <http://lblod.data.gift/vocabularies/besluit/>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>    
      PREFIX ref: <http://lblod.data.gift/vocabularies/referencing/>
      PREFIX BestuurseenheidClassificatieCode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>

      SELECT DISTINCT ?referredDecisionType
      WHERE {
        ?rule
          rdf:type ref:ReferencingRule ;
          rdfs:domain ${mu.sparqlEscapeUri(referrerDecisionType)} ;
          rdfs:range ?referredDecisionType .
          FILTER NOT EXISTS {
            ?rule
              besluit:decidableBy BestuurseenheidClassificatieCode:5ab0e9b8a3b2ca7c5e000001 ;
              besluit:referredDecidableBy BestuurseenheidClassificatieCode:f9cac08a-13c1-49da-9bcb-f650b0604054 .
          }
      }
      LIMIT 1
    `);
  } else {
    response = await mas.querySudo(`
      PREFIX lblodBesluit: <http://lblod.data.gift/vocabularies/besluit/>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>    
      PREFIX ref: <http://lblod.data.gift/vocabularies/referencing/>
      PREFIX BestuurseenheidClassificatieCode: <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/>

      SELECT DISTINCT ?referredDecisionType
      WHERE {
        ?rule
          rdf:type ref:ReferencingRule ;
          rdfs:domain ${mu.sparqlEscapeUri(referrerDecisionType)} ;
          rdfs:range ?referredDecisionType ;
          besluit:decidableBy BestuurseenheidClassificatieCode:5ab0e9b8a3b2ca7c5e000001 ;
          besluit:referredDecidableBy BestuurseenheidClassificatieCode:f9cac08a-13c1-49da-9bcb-f650b0604054 .
      }
      LIMIT 1
    `);
  }

  if (response?.results?.bindings?.length) {
    return response.results.bindings[0].referredDecisionType.value;
  }
}
