# QLeverToWebAssembly
This repo contains a project which starts a simple, locally hosted website. On this site you can query prebuilt indexes using the SPARQL language.
This is done with the port from [QLever](https://github.com/ad-freiburg/qlever) to WebAssembly which was compiled with Emscripten.

A working demo can be found [here](https://qlever-to-webassembly.netlify.app/)

Ignore the Input prompt when loading the page.

First, select one of the three prebuilt indexes to load it.

The first and third indexes are about characters from the TV shows 'Dr. House' and 'The Big Bang Theory' respectively.
The second index is about IRIs (Internationalized Resource Identifiers).

Then you can either select one of the preset queries (3 for each index) or type your own query into the box.
After you have set a query, press enter within the box or click the 'run query' button.
You should see the result on the bottom of the page.
