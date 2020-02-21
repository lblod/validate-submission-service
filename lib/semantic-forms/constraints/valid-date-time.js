import validDate from './valid-date';
/**
 * Checks if the given string is an valid date-time format conform to xsd:datetime.
 * Expected datetime format ex: 01-01-2020T01:01:01Z
 */
export default function constraintValidDateTime(value, options) {
  let dateString = value.value.substring(0, value.value.indexOf("T"));
  let timeString = value.value.substring((value.value.indexOf("T") + 1), value.value.indexOf("Z"));
  return (validDate({value: dateString}, options) && validTime({value: timeString}, options));
}

function validTime(value, options) {
  return /^([0-1]?[0-9]|2[0-4]):([0-5][0-9])(:[0-5][0-9])(\.[0-9]{3})?/.test(value.value);
}
