// See: https://docs.google.com/spreadsheets/d/1DIQkJTCy3Z16xsZaE2QFOhXCQBDKS4ifeYV_592DxRw/edit?gid=1195904946#gid=1195904946

// These mappings are used to look up Submissions that can be referred to. Keys
// are the current document type selected and the values are the possible
// Submissions types that can be referred to. Use the form:
// {
//   "current submission type URI": "type URI that can be referenced from the current document"
// }

// Extra example: imagine document flow from EB (Eredienstbestuur) to Gemeente.
// The Gemeente is logged in and wants to reference documents from the EB. The
// Gemeente makes a document of type "Goedkeuringsbesluit Budget(wijziging)",
// then this service needs to look for documents by the EB of the type
// "Budgetten(wijzigingen) - Indiening bij toezichthoudende gemeente of
// provincie". Translate this directly to a mapping of the form:
// {
//   // Goedkeuringsbesluit Budget(wijziging)
//   "https://data.vlaanderen.be/id/concept/BesluitType/df261490-cc74-4f80-b783-41c35e720b46":
//       // Budgetten(wijzigingen) - Indiening bij toezichthoudende gemeente of provincie
//       "https://data.vlaanderen.be/id/concept/BesluitDocumentType/ce569d3d-25ff-4ce9-a194-e77113597e29"
// }

export const crossReferenceMappingsGemeente_EB = {
  // Advies bij jaarrekening eredienstbestuur
  "https://data.vlaanderen.be/id/concept/BesluitType/79414af4-4f57-4ca3-aaa4-f8f1e015e71c":
    // Jaarrekening
    "https://data.vlaanderen.be/id/concept/BesluitType/e44c535d-4339-4d15-bdbf-d4be6046de2c",

  // Besluit over budget(wijziging) eredienstbestuur
  "https://data.vlaanderen.be/id/concept/BesluitType/df261490-cc74-4f80-b783-41c35e720b46":
    // Budget(wijziging) - Indiening bij toezichthoudende gemeente of provincie
    "https://data.vlaanderen.be/id/concept/BesluitType/d85218e2-a75f-4a30-9182-512b5c9dd1b2",

  // Besluit over meerjarenplan(aanpassing) eredienstbestuur
  "https://data.vlaanderen.be/id/concept/BesluitType/3fcf7dba-2e5b-4955-a489-6dd8285c013b":
    // Meerjarenplan(aanpassing)
    "https://data.vlaanderen.be/id/concept/BesluitType/f56c645d-b8e1-4066-813d-e213f5bc529f",

  // Schorsing beslissing eredienstbesturen
  "https://data.vlaanderen.be/id/concept/BesluitType/b25faa84-3ab5-47ae-98c0-1b389c77b827":
    // Notulen
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/8e791b27-7600-4577-b24e-c7c29e0eb773",

  // Opvragen bijkomende inlichtingen eredienstbesturen (met als gevolg stuiting termijn)
  "https://data.vlaanderen.be/id/concept/BesluitDocumentType/24743b26-e0fb-4c14-8c82-5cd271289b0e":
    // Notulen
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/8e791b27-7600-4577-b24e-c7c29e0eb773",
}

export const crossReferenceMappingsGemeente_CKB_EB = {
  // Advies bij jaarrekening eredienstbestuur
  "https://data.vlaanderen.be/id/concept/BesluitType/79414af4-4f57-4ca3-aaa4-f8f1e015e71c":
    // Jaarrekeningen van de besturen van de eredienst
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/672bf096-dccd-40af-ab60-bd7de15cc461",

  // Besluit over budget(wijziging) eredienstbestuur
  "https://data.vlaanderen.be/id/concept/BesluitType/df261490-cc74-4f80-b783-41c35e720b46":
    // Budgetten(wijzigingen) - Indiening bij toezichthoudende gemeente of provincie
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/ce569d3d-25ff-4ce9-a194-e77113597e29",

  // Besluit over meerjarenplan(aanpassing) eredienstbestuur
  "https://data.vlaanderen.be/id/concept/BesluitType/3fcf7dba-2e5b-4955-a489-6dd8285c013b":
    // Meerjarenplannen(wijzigingen) van de besturen van de eredienst
    "https://data.vlaanderen.be/id/concept/BesluitDocumentType/2c9ada23-1229-4c7e-a53e-acddc9014e4e",

  // Jaarrekeningen van de besturen van de eredienst
  "https://data.vlaanderen.be/id/concept/BesluitDocumentType/672bf096-dccd-40af-ab60-bd7de15cc461":
    // Jaarrekening
    "https://data.vlaanderen.be/id/concept/BesluitType/e44c535d-4339-4d15-bdbf-d4be6046de2c",

  // Budgetten(wijzigingen) - Indiening bij representatief orgaan
  "https://data.vlaanderen.be/id/concept/BesluitDocumentType/18833df2-8c9e-4edd-87fd-b5c252337349":
    // Budget(wijziging) - Indiening bij centraal bestuur of representatief orgaan
    "https://data.vlaanderen.be/id/concept/BesluitType/d463b6d1-c207-4c1a-8c08-f2c7dd1fa53b",

  // Budgetten(wijzigingen) - Indiening bij toezichthoudende gemeente of provincie
  "https://data.vlaanderen.be/id/concept/BesluitDocumentType/ce569d3d-25ff-4ce9-a194-e77113597e29":
    // Budget(wijziging) - Indiening bij centraal bestuur of representatief orgaan
    "https://data.vlaanderen.be/id/concept/BesluitType/d463b6d1-c207-4c1a-8c08-f2c7dd1fa53b",

  // Meerjarenplannen(wijzigingen) van de besturen van de eredienst
  "https://data.vlaanderen.be/id/concept/BesluitDocumentType/2c9ada23-1229-4c7e-a53e-acddc9014e4e":
    // Meerjarenplan(aanpassing)
    "https://data.vlaanderen.be/id/concept/BesluitType/f56c645d-b8e1-4066-813d-e213f5bc529f",
}
