export interface PresetQuery {
  id: string;
  label: string;
  sparql: string;
  datasets: string[];
}

export const PRESET_QUERIES: PresetQuery[] = [
  {
    id: 'house-persons',
    label: 'Select all persons',
    sparql: `PREFIX schema: <http://schema.org/>
SELECT * {
  ?person a schema:Person
}`,
    datasets: ['House'],
  },
  {
    id: 'house-details',
    label: 'Select all persons with names and job titles',
    sparql: `PREFIX schema: <http://schema.org/>
SELECT ?person ?givenName ?familyName ?jobTitle
WHERE {
    ?person a schema:Person ;
              schema:givenName ?givenName ;
              schema:familyName ?familyName ;
              schema:jobTitle ?jobTitle
}`,
    datasets: ['House'],
  },
  {
    id: 'house-knows-greg',
    label: 'Select all persons who know Gregory House',
    sparql: `PREFIX schema: <http://schema.org/>
SELECT ?person ?givenName ?familyName
WHERE {
    ?person schema:knows <https://housemd.rdf-ext.org/person/gregory-house> ;
            schema:givenName ?givenName ;
            schema:familyName ?familyName .
}`,
    datasets: ['House'],
  },
  {
    id: 'iri-strends',
    label: 'Find all objects that end with /g',
    sparql: `PREFIX ex: <urn:ex:>
SELECT ?s ?o
WHERE {
    ?s ex:p ?o .
    FILTER(STRENDS(STR(?o), <http://a/bb/ccc/g>))
}`,
    datasets: ['IRI-resolution'],
  },
  {
    id: 'iri-question',
    label: "Find all objects with a '?'",
    sparql: `PREFIX ex: <urn:ex:>
SELECT ?s ?o
WHERE {
    ?s ex:p ?o .
    FILTER(CONTAINS(STR(?o), '?'))
}`,
    datasets: ['IRI-resolution'],
  },
  {
    id: 'iri-hash',
    label: "Find all objects that contain a '#'",
    sparql: `PREFIX ex: <urn:ex:>
SELECT ?s ?o
WHERE {
    ?s ex:p ?o .
    FILTER(CONTAINS(STR(?o), '#'))
}`,
    datasets: ['IRI-resolution'],
  },
  {
    id: 'tbbt-characters',
    label: 'List all characters and their full names',
    sparql: `PREFIX schema: <http://schema.org/>
PREFIX ex: <http://example.org/>

SELECT ?character ?givenName ?familyName
WHERE {
    ?character a schema:Person ;
                 schema:givenName ?givenName ;
                 schema:familyName ?familyName .
}`,
    datasets: ['TBBT'],
  },
  {
    id: 'tbbt-knows-sheldon',
    label: 'Find all characters who know Sheldon Cooper',
    sparql: `PREFIX schema: <http://schema.org/>
PREFIX person: <http://localhost:8080/data/person/>

SELECT ?character ?givenName
WHERE {
    ?character schema:knows person:sheldon-cooper ;
               schema:givenName ?givenName .
}`,
    datasets: ['TBBT'],
  },
  {
    id: 'tbbt-mutual',
    label: 'Find all pairs of characters who know each other',
    sparql: `PREFIX schema: <http://schema.org/>
PREFIX ex: <http://example.org/>

SELECT ?person1 ?givenName1 ?familyName1 ?person2 ?givenName2 ?familyName2
WHERE {
    ?person1 schema:knows ?person2 ;
             schema:givenName ?givenName1 ;
             schema:familyName ?familyName1 .
    ?person2 schema:knows ?person1 ;
             schema:givenName ?givenName2 ;
             schema:familyName ?familyName2 .
    FILTER(?person1 < ?person2)  # Avoid duplicate pairs (A-B and B-A)
}`,
    datasets: ['TBBT'],
  },
];
