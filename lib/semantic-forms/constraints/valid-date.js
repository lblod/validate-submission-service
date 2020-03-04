/**
 * Checks if the given string is an valid date format conform to xsd:date.
 * Expected date format ex: 01-01-2020
 */
export default function constraintValidDate(value, options) {
  if(value.datatype.value !== "http://www.w3.org/2001/XMLSchema#date"){
    return false;
  }

  let dateString = value.value;

  // First check for the pattern
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(dateString))
    return false;

  // Parse the date parts to integers
  let parts = dateString.split("-");
  let day = parseInt(parts[2], 10);
  let month = parseInt(parts[1], 10);
  let year = parseInt(parts[0], 10);

  // Check the ranges of month and year
  if (year < 1000 || year > 3000 || month == 0 || month > 12)
    return false;

  let monthLength = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Adjust for leap years
  if (year % 400 == 0 || (year % 100 != 0 && year % 4 == 0))
    monthLength[1] = 29;

  // Check the range of the day
  return day > 0 && day <= monthLength[month - 1];
}
