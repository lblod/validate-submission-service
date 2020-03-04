/**
 * Checks if the given string is an valid date-time format conform to xsd:datetime.
 * Expected datetime format ex: 01-01-2020T01:01:01Z
 */
export default function constraintValidDateTime(value) {
  if(value.datatype.value !== "http://www.w3.org/2001/XMLSchema#dateTime"){
    return false;
 }
  return validDateTimeString(value.value);
}

// TODO: use moment.js or so as a library,
// but since this code needs to be shared between frontend and backend, including external dependcies.
// Source of this regex: https://stackoverflow.com/a/14322189/1092608
// and http://www.pelagodesign.com/blog/2009/05/20/iso-8601-date-validation-that-doesnt-suck/
// see https://binnenland.atlassian.net/browse/DL-1229
function validDateTimeString(value) {
  return /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24\:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/.test(value);
  debugger
}
