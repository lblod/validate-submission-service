//  TODO: move this to template
export function sparqlEscapeUri(value) {
  console.log('Warning: using a monkey patched sparqlEscapeUri.');
  return `<${value.replace(/[\\"<>]/g, (match) => `\\${match}`)}>`;
}