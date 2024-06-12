import { registerCustomValidation } from '@lblod/submission-form-helpers';
import { Literal, NamedNode, Namespace } from 'rdflib';

const ELI = new Namespace('http://data.europa.eu/eli/ontology#');
const refersTo = ELI('refers_to');
const documentType = ELI('type_document');

export function registerDecisionArticlesValidator() {
  registerCustomValidation(
    'http://lblod.data.gift/vocabularies/forms/DecisionArticlesValidator',
    // This validator assumes a form:Bag grouping with the `sh:path` set to `eli:has_part`
    // Keep this in sync with the frontend version: https://github.com/lblod/frontend-loket/blob/11d440cb94d24f26b16a5774ad02d55b83b401dd/app/components/supervision/decision-articles-field.gjs#L906-L944
    (articles, options) => {
      if (articles.length === 0) {
        return false;
      }

      const { constraintUri, formGraph, store, sourceGraph } = options;

      const areArticlesValid = articles
        .map((articleNode) => {
          const documents = store.match(
            articleNode,
            refersTo,
            undefined,
            sourceGraph,
          );

          if (documents.length === 0) {
            return false;
          }

          const isTypeOptional = isDocumentTypeOptional(
            store,
            constraintUri,
            formGraph,
          );

          if (isTypeOptional) {
            return true;
          }

          const type = store.any(articleNode, documentType, undefined, sourceGraph);

          return Boolean(type);
        })
        .every(Boolean);

      return areArticlesValid;
    }
  );
}

function isDocumentTypeOptional(store, node, formGraph) {
  const literal = store.any(
    node,
    new NamedNode(
      'http://lblod.data.gift/vocabularies/form-field-options/exclude-type_document',
    ),
    undefined,
    formGraph,
  );

  return typeof literal !== 'undefined' && literal !== null && Literal.toJS(literal);
}