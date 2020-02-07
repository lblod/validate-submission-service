import { RDF, FORM, SHACL } from './namespaces';
import { triplesForPath } from './import-triples-for-form';

import required from './constraints/required';
import codelist from './constraints/codelist';
import singleCodelistValue from './constraints/single-codelist-value';
import exactValue from './constraints/exact-value';
import besluittype from './constraints/besluittype';
import validUri from './constraints/valid-uri';

export default function constraintForUri(uri) {
  switch (String(uri)) {
    case "http://lblod.data.gift/vocabularies/forms/RequiredConstraint":
      return required;
    case "http://lblod.data.gift/vocabularies/forms/SingleCodelistValue":
      return singleCodelistValue;
    case "http://lblod.data.gift/vocabularies/forms/Codelist":
      return codelist;
    case "http://lblod.data.gift/vocabularies/forms/ExactValueConstraint":
      return exactValue;
    case "http://lblod.data.gift/vocabularies/forms/BesluittypeConstraint":
      return besluittype;
    case "http://lblod.data.gift/vocabularies/forms/UriConstraint":
      return validUri;
    default:
      return false; //TODO: TBD
  }
}

function check(constraintUri, options){
  const { formGraph, sourceNode, sourceGraph, metaGraph, store } = options;

  const validationType = store.any(constraintUri, RDF('type'), undefined, formGraph);
  const groupingType = store.any(constraintUri, FORM("grouping"), undefined, formGraph).value;
  const resultMessage = (store.any(constraintUri, SHACL("resultMessage"), undefined, formGraph) || "").value;

  let validator = constraintForUri(validationType && validationType.value);
  if( !validator ) return { hasValidation: false, valid: true, resultMessage };

  let path = store.any( constraintUri, SHACL("path"), undefined, formGraph);

  let values = triplesForPath({
    store: store, path, formGraph: formGraph, sourceNode: sourceNode, sourceGraph: sourceGraph
  }).values;

  const validationOptions = { store, metaGraph, constraintUri };

  let validationResult;

  if( groupingType == FORM("Bag").value ) {
    validationResult = validator( values, validationOptions );
  } else if( groupingType == FORM("MatchSome").value ) {
    validationResult = values.some( (value) => validator( value, validationOptions ) );
  } else if( groupingType == FORM("MatchEvery").value ) {
    validationResult = values.every( (value) => validator( value, validationOptions ) );
  }

  console.log(`Validation ${validationType} [${groupingType}] with values ${values.join(',')} is ${validationResult}`);
  return { hasValidation: true, valid: validationResult, resultMessage };
}

function missingConstraint(value, options) {
  console.log(`No constraint method found for ${options.constraintUri}`);
  return false;
}

export { check };
