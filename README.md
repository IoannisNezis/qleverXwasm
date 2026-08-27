# QLeverToWebAssembly
This repo contains a project which starts a simple, locally hosted website. On this site you can build an index from
your own RDF data and query it using the SPARQL language.
This is done with the port from [QLever](https://github.com/ad-freiburg/qlever) to WebAssembly which was compiled with
Emscripten.

First, provide the data to index: either upload an RDF file or paste RDF data into the text box. Pick the matching file
type and press 'Build Index'. Both the index building and the querying happen entirely in your browser.

Once the index is ready, type a SPARQL query into the query box and press Ctrl+Enter or click 'Run Query'.
You should see the result on the bottom of the page.

The generated index files can be saved to disk with 'Download Index Files'.

## Running it in a container

`Dockerfile` builds the site with Node and serves the result with nginx:

```
docker build -t qlever-wasm .
docker run --rm -p 8080:80 qlever-wasm
```

The app is then at http://localhost:8080/. nginx sends the COOP/COEP headers the
engine needs, serves the fingerprinted assets as immutable, and hands out
pre-compressed copies of the JS, CSS and the ~60 MB `.wasm`.
