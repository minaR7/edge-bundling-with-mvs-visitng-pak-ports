const urls = {
  map: "https://gist.githubusercontent.com/d3noob/5193723/raw/world-110m2.json",
  ports: "https://minar7.github.io/edge-bundling-with-mvs-visitng-pak-ports/ports2.csv",
  vessel_routes: "https://minar7.github.io/edge-bundling-with-mvs-visitng-pak-ports/vessel_routes2.csv",
  airports:
  "https://gist.githubusercontent.com/mbostock/7608400/raw/e5974d9bba45bc9ab272d98dd7427567aafd55bc/airports.csv",
};


console.log(urls)
console.log(d3.version)
console.log(d3)

var width = 1000,
  height = 510;
  
const hypotenuse = Math.sqrt(width * width + height * height);
const svg = d3.select("svg")
    .attr("width", width)
    .attr("height", height);

const scales = {
  // used to scale airport bubbles
  ports: d3.scaleSqrt()
    .range([4, 18]),
    airports: d3.scaleSqrt()
    .range([4, 18]),
  // used to scale number of segments per line
  segments: d3.scaleLinear()
    .domain([0, hypotenuse])
    .range([1, 10])
};

const projection = d3.geoMercator()
  .center([47.0011, 24.8607]) //long and lat starting position
  .scale(400)
  .rotate([2,0]); //where world split occurs


const path = d3.geoPath().projection(projection);

// have these already created for easier drawing
const g = {
  basemap:  svg.select("g#basemap"),
  vessel_routes:  svg.select("g#vessel_routes"),
  ports: svg.select("g#ports"),
  voronoi:  svg.select("g#voronoi"),
  airports: svg.select("g#airports"),
};

const tooltip = d3.select("text#tooltip");
console.assert(tooltip.size() === 1);

// load and draw base map
d3.json(urls.map).then(drawMap);

 // load the airport and flight data together
 const promises = [
  d3.csv(urls.ports, typeAirport),
  d3.csv(urls.vessel_routes,  typeFlight),
  d3.csv(urls.airports, typeAirport),
];

Promise.all(promises).then(processData);

// process airport and flight data
function processData(values) {
  console.assert(values.length === 3);

  let airports = values[0];
  let flights  = values[1];
  let old = values[2];

  console.log("airports: " + airports.length);
  console.log(" flights: " + flights.length);

  console.log(" old airports: " + old.length);
  // convert airports array (pre filter) into map for fast lookup
  // let iata = new Map(airports.map(node => {console.log(node); [node.key, node]}));
  let keyiata = new Map(airports.map(node => {
    // console.log(node);  // Check the node structure
    if (node.key) {
      return [node.key, node];  // Only return valid key-value pairs
    } else {
      return [];  // If no key, skip this entry
    }
  }).filter(pair => pair.length > 0)); // Filter out empty pairs

  // calculate incoming and outgoing degree based on flights
  // flights are given by airport iata code (not index)
  flights.forEach(function(link) {
    // console.log(link, iata)
    link.source = keyiata.get(link.LPOC);
    link.target = keyiata.get(link.PORT);

    link.source.outgoing += link.count;
    link.target.incoming += link.count;
  });

  airports = airports.filter(airport => {
    // console.log(airport); 
    return !isNaN(airport.longitude) && !isNaN(airport.latitude);
  });
  // sort airports by outgoing degree
  airports.sort((a, b) => d3.descending(a.outgoing, b.outgoing));

  // done filtering airports can draw
  drawAirports(airports);
  drawAirportsG(old);
  drawPolygons(old);

  // reset map to only include airports post-filter
  keyiata = new Map(airports.map(node => [node.keyiata, node]));

  // filter out flights that are not between airports we have leftover
  old = flights.length;
  flights = flights.filter(link => keyiata.has(link.source.keyiata) && keyiata.has(link.target.keyiata));
  console.log(" removed: " + (old - flights.length) + " flights");

  // done filtering flights can draw
  drawFlights(airports, flights);

  console.log({airports: airports});
  console.log({flights: flights});
}

  var zoom = d3.zoom()
    .on("zoom", function() { // Explicitly receive the event
        // console.log(d3.event); // Log event to confirm it's defined

        var transform = d3.event.transform; // Get zoom transform
        g.basemap.attr("transform", transform.toString()); 
        g.vessel_routes.attr("transform", transform.toString());
        g.ports.attr("transform", transform.toString());
        g.ports.selectAll("circle.port") // Assuming ports are represented by circle elements
        .attr("r", function(d) {
            // Adjust the radius based on the zoom scale (transform.k)
            var scaleFactor = 1 / transform.k; // You can tweak this formula to control the scaling
            return d.originalRadius * scaleFactor; // d.originalRadius should be the initial radius of the port
        })
        .style("stroke-width", function(d) {
          // Adjust the radius based on the zoom scale (transform.k)
          var scaleFactor = 2 / transform.k; // You can tweak this formula to control the scaling
          return d.stroke * scaleFactor; // d.originalRadius should be the initial radius of the port
        });
        g.vessel_routes.selectAll("path") // Assuming ports are represented by circle elements
        .style("stroke-width", function(d) {
          // Adjust the radius based on the zoom scale (transform.k)
          var scaleFactor = 1 / transform.k; // You can tweak this formula to control the scaling
          return d.stroke * scaleFactor; // d.originalRadius should be the initial radius of the port
        });
    });

svg.call(zoom);

// draws the underlying map
function drawMap(map) {
console.log("TopoJSON Keys:", Object.keys(map.objects));

// Convert TopoJSON to GeoJSON
let countries = topojson.feature(map, map.objects.countries);
console.log("Converted GeoJSON:", countries);
console.log("Features:", countries.features);

if (!countries.features || countries.features.length === 0) {
    console.error("No country features found!");
    return;
}

// console.log("Projection Debug:", projection);
// console.log("Path Debug:", path, g.basemap);

// Draw countries
g.basemap.selectAll("path")
    .data(countries.features)
    .enter().append("path")
    .attr("d", path)
    .style("fill", "#ccc")
    .style("stroke", "#333");
}

function drawAirports(airports) {
console.log(airports);

g.ports.selectAll("circle.ports")
  .data(airports, d => d.iata)
  .enter()
  .append("circle")
  // .attr("r", 3) // set a fixed radius
  .attr("r", d => {
    // Store the original radius in the data
    d.originalRadius = 5; // Example radius value
    return d.originalRadius;
  })
  .attr("stroke-width", d => {
    // Store the original radius in the data
    d.stroke = 1; // Example radius value
    return d.stroke;
  })
  .attr("cx", d => d.x) // x-coordinate of the circle
  .attr("cy", d => d.y) // y-coordinate of the circle
  .attr("name", d => d.port_all)
  .attr("long", d => d.longitude) // longitude for the port
  .attr("lat", d => d.latitude) // latitude for the port
  .attr("connections", d => console.log(d))
  .attr("class", "port")
  .each(function(d) {
    // adds the circle object to the airport data
    d.bubble = this;
  })
  .on("mouseover", function(event, d) {
    // Accessing the circle's attributes directly
    const circle = this; // 'this' refers to the current circle element

    const name = circle.getAttribute("name");
    const longitude = circle.getAttribute("long");
    const latitude = circle.getAttribute("lat");
    const cx = circle.getAttribute("cx");
    const cy = circle.getAttribute("cy");

    console.log(`Circle Attributes: ${name}, ${longitude}, ${latitude}, ${cx}, ${cy}`);

    // Show airport details on hover
    const tooltip = d3.select("body").append("div")
      .attr("class", "tooltip")
      .style("position", "absolute")
      .style("background", "rgba(0, 0, 0, 0.7)")
      .style("color", "#fff")
      .style("padding", "5px")
      .style("border-radius", "5px")
      .style("pointer-events", "none")
      .html(`
        <strong>Port Name:</strong> ${name}<br>
        <div>Long, Lat:</div> (${longitude}, ${latitude})
      `);
      // /        // <p>XY Coordinates:</p> (${cx}, ${cy})

    // Position the tooltip near the circle using the circle's cx, cy
    tooltip.style("left", (parseFloat(cx) + 10) + "px") // Add some offset to the tooltip
           .style("top", (parseFloat(cy) + 10) + "px"); // Add some offset to the tooltip

    // Color all paths related to the port red
    // Assuming the 'key' in each path data is the same as the port's key
    g.vessel_routes.selectAll("path.vessel_routes")
      .filter(function(pathData) {
        
        // console.log(pathData[pathData.length-1])
        if(pathData[0].port_all === circle.getAttribute("name"))
        { console.log(pathData[0].port_all, pathData[pathData.length-1].port_all)
          return pathData[0].port_all === circle.getAttribute("name")}
        else if(pathData[pathData.length-1].port_all === circle.getAttribute("name"))
        {  console.log(pathData[0].port_all, pathData[pathData.length-1].port_all)
          return pathData[pathData.length-1].port_all === circle.getAttribute("name");}
      })
      .attr("class", "highlight")
      // .style("stroke", "red") // Change path color to red
      // .style("stroke-width", 2); // Optional, make it thicker to highlight

  })
  .on("mouseout", function() {
    // Remove the tooltip on mouseout
    d3.select(".tooltip").remove();

    // Reset path colors when mouse leaves
    g.vessel_routes.selectAll("path.highlight")
      // .style("stroke", null) // Reset to the original stroke color
      // .style("stroke-width", 1) // Reset stroke width
      .attr("class", "vessel_routes") 
  });
}

function drawFlights(airports, flights) {
  // Break each flight between airports into multiple segments
  let bundle = generateSegments(airports, flights);
  console.log(bundle);

  // Use d3.curveCardinal for more control over the curve's appearance
  // You can adjust the tension value (0 to 1) to control the curve tightness
  let line = d3.line()
    .curve(d3.curveCardinal.tension(0.7))  // Adjust tension for more curved edges (default is 0.5)
    .x(airport => airport.x)
    .y(airport => airport.y);

  console.log(bundle.paths);

  let links = g.vessel_routes.selectAll("path.vessel_routes")
    .data(bundle.paths)
    .enter()
    .append("path")
    .attr("d", function(d) {
      // Check if the path data contains NaN and filter invalid points
      const validPath = d.filter(p => !isNaN(p.x) && !isNaN(p.y));
      if (validPath.length > 0) {
        return line(validPath);  // Generate path if valid
      } else {
        return "";  // Return empty string if path is invalid
      }
    })
    .style("stroke-width", d => {
      // Store the original radius in the data
      d.stroke = 1; // Example radius value
      return d.stroke;
    })
    .attr("class", "vessel_routes")
    .each(function(d) {
      // Adds the path object to our source airport
      // Makes it fast to select outgoing paths
      console.log(d);
      if (d[0]) {
        d[0].flights.push(this);
      }
    });

  // Ensure nodes and links are defined correctly
  console.log(bundle.nodes);  // Check nodes
  console.log(bundle.links);  // Check links

  // Force layout for positioning nodes
  let layout = d3.forceSimulation()
    .alphaDecay(0.1)
    .force("charge", d3.forceManyBody().strength(10).distanceMax(scales.ports.range()[1] * 2))
    .force("link", d3.forceLink().strength(0.7).distance(0))
    .on("tick", function(d) {
      links.attr("d", line);
    })
    .on("end", function(d) {
      console.log("layout complete");
    });

  layout.nodes(bundle.nodes).force("link").links(bundle.links);
}

function generateSegments(nodes, links) {
  // Generate separate graph for edge bundling
  let bundle = {nodes: [], links: [], paths: []};

  // Make existing nodes fixed
  bundle.nodes = nodes.map(function(d) {
    d.fx = d.x;
    d.fy = d.y;
    return d;
  });

  links.forEach(function(d) {
    // Calculate the distance between the source and target
    let length = distance(d.source, d.target);

    // Calculate total number of inner nodes for this link
    let total = Math.round(scales.segments(length));

    // Create scales from source to target
    let xscale = d3.scaleLinear()
      .domain([0, total + 1]) // Source, inner nodes, target
      .range([d.source.x, d.target.x]);

    let yscale = d3.scaleLinear()
      .domain([0, total + 1])
      .range([d.source.y, d.target.y]);

    // Initialize source node
    let source = d.source;
    let target = null;

    // Add all points to local path
    let local = [source];

    for (let j = 1; j <= total; j++) {
      // Calculate target node
      target = {
        x: xscale(j),
        y: yscale(j)
      };

      local.push(target);
      bundle.nodes.push(target);

      bundle.links.push({
        source: source,
        target: target
      });

      source = target;
    }

    local.push(d.target);

    // Add last link to target node
    bundle.links.push({
      source: target,
      target: d.target
    });

    bundle.paths.push(local);
  });

  return bundle;
}
function drawPolygons(airports) {
  // convert array of airports into geojson format
  const geojson = airports.map(function(airport) {
    return {
      type: "Feature",
      properties: airport,
      geometry: {
        type: "Point",
        coordinates: [airport.longitude, airport.latitude]
      }
    };
  });

  // calculate voronoi polygons
  const polygons = d3.geoVoronoi().polygons(geojson);
  console.log(polygons);

  g.voronoi.selectAll("path")
    .data(polygons.features)
    .enter()
    .append("path")
    .attr("d", d3.geoPath(projection))
    .attr("class", "voronoi")
    .on("mouseover", function(d) {
      let airport = d.properties.site.properties;

      d3.select(airport.bubble)
        .classed("highlight", true);

      d3.selectAll(airport.flights)
        .classed("highlight", true)
        .raise();

      // make tooltip take up space but keep it invisible
      tooltip.style("display", null);
      tooltip.style("visibility", "hidden");

      // set default tooltip positioning
      tooltip.attr("text-anchor", "middle");
      tooltip.attr("dy", -scales.airports(airport.outgoing) - 4);
      tooltip.attr("x", airport.x);
      tooltip.attr("y", airport.y);

      // set the tooltip text
      tooltip.text(airport.name + " in " + airport.city + ", " + airport.state);

      // double check if the anchor needs to be changed
      let bbox = tooltip.node().getBBox();

      if (bbox.x <= 0) {
        tooltip.attr("text-anchor", "start");
      }
      else if (bbox.x + bbox.width >= width) {
        tooltip.attr("text-anchor", "end");
      }

      tooltip.style("visibility", "visible");
    })
    .on("mouseout", function(d) {
      let airport = d.properties.site.properties;

      d3.select(airport.bubble)
        .classed("highlight", false);

      d3.selectAll(airport.flights)
        .classed("highlight", false);

      d3.select("text#tooltip").style("visibility", "hidden");
    })
    .on("dblclick", function(d) {
      // toggle voronoi outline
      let toggle = d3.select(this).classed("highlight");
      d3.select(this).classed("highlight", !toggle);
    });
}


// function drawFlights(airports, flights) {
// // break each flight between airports into multiple segments
// let bundle = generateSegments(airports, flights);
// console.log(bundle)

// // https://github.com/d3/d3-shape#curveBundle
// let line = d3.line()
//   .curve(d3.curveBundle)
//   .x(airport => airport.x)
//   .y(airport => airport.y);

//   console.log(bundle.paths);

//   let links = g.vessel_routes.selectAll("path.vessel_routes")
//   .data(bundle.paths)
//   .enter()
//   .append("path")
//   .attr("d", function(d) {
//     // Check if the path data contains NaN and filter invalid points
//     const validPath = d.filter(p => !isNaN(p.x) && !isNaN(p.y));
//     if (validPath.length > 0) {
//       return line(validPath);  // Generate path if valid
//     } else {
//       return "";  // Return empty string if path is invalid
//     }
//   })
//   .attr("class", "vessel_routes")
//   .each(function(d) {
//     // adds the path object to our source airport
//     // makes it fast to select outgoing paths
//     console.log(d);
//     if (d[0]) {
//       d[0].flights.push(this);
//     }
//   });

// // Ensure nodes and links are defined correctly
// console.log(bundle.nodes);  // Check nodes
// console.log(bundle.links);  // Check links

// // https://github.com/d3/d3-force
// let layout = d3.forceSimulation()
//   // settle at a layout faster
//   .alphaDecay(0.1)
//   // nearby nodes attract each other
//   .force("charge", d3.forceManyBody()
//     .strength(10)
//     .distanceMax(scales.ports.range()[1] * 2)
//   )
//   // edges want to be as short as possible
//   // prevents too much stretching
//   .force("link", d3.forceLink()
//     .strength(0.7)
//     .distance(0)
//   )
//   .on("tick", function(d) {
//     links.attr("d", line);
//   })
//   .on("end", function(d) {
//     console.log("layout complete");
//   });

// layout.nodes(bundle.nodes).force("link").links(bundle.links);
// }

// Turns a single edge into several segments that can
// be used for simple edge bundling.

// function drawFlights(flightsData) {
//   console.log(flightsData)
//   Define the curve type for smoother, more curved edges
//   const curveType = d3.curveBasis;  // You can try other curves like d3.curveCardinal

//   Define the line generator with the curve applied
//   const lineGenerator = d3.line()
//     .curve(curveType)  // Apply the curve
//     .x(d => projection([d.lon, d.lat])[0])  // Project longitude and latitude to x position
//     .y(d => projection([d.lon, d.lat])[1]);  // Project longitude and latitude to y position

//   Select the SVG group for the flight paths
//   const flightsGroup = svg.select(".flight-paths");

//   Bind data to paths and draw flights
//   flightsGroup.selectAll("path")
//     .data(flightsData)
//     .enter().append("path")
//     .attr("d", d => lineGenerator(d.route))  // Use the line generator to create the curved path
//     .attr("stroke", "green")  // Flight paths color
//     .attr("stroke-width", 2)
//     .attr("fill", "none")
//     .on("mouseover", function(event, d) {
//       Highlight the path on mouseover
//       d3.select(this).attr("stroke", "orange").attr("stroke-width", 4);
//     })
//     .on("mouseout", function(event, d) {
//       Reset the path on mouseout
//       d3.select(this).attr("stroke", "green").attr("stroke-width", 2);
//     });
// }


// function generateSegments(nodes, links) {
// // generate separate graph for edge bundling
// // nodes: all nodes including control nodes
// // links: all individual segments (source to target)
// // paths: all segments combined into single path for drawing
// let bundle = {nodes: [], links: [], paths: []};

// // make existing nodes fixed
// bundle.nodes = nodes.map(function(d, i) {
//   d.fx = d.x;
//   d.fy = d.y;
//   return d;
// });

// links.forEach(function(d, i) {
//   // console.log(d,i)
//   // calculate the distance between the source and target
//   let length = distance(d.source, d.target);

//   // calculate total number of inner nodes for this link
//   let total = Math.round(scales.segments(length));

//   // create scales from source to target
//   let xscale = d3.scaleLinear()
//     .domain([0, total + 1]) // source, inner nodes, target
//     .range([d.source.x, d.target.x]);

//   let yscale = d3.scaleLinear()
//     .domain([0, total + 1])
//     .range([d.source.y, d.target.y]);

//   // initialize source node
//   let source = d.source;
//   let target = null;

//   // add all points to local path
//   let local = [source];

//   for (let j = 1; j <= total; j++) {
//     // calculate target node
//     target = {
//       x: xscale(j),
//       y: yscale(j)
//     };

//     local.push(target);
//     bundle.nodes.push(target);

//     bundle.links.push({
//       source: source,
//       target: target
//     });

//     source = target;
//   }

//   local.push(d.target);

//   // add last link to target node
//   bundle.links.push({
//     source: target,
//     target: d.target
//   });

//   bundle.paths.push(local);
// });

// return bundle;
// }
function isContinental(state) {
  const id = parseInt(state.id);
  return id < 60 && id !== 2 && id !== 15;
}

function drawAirportsG(airports) {
  // adjust scale
  // const extent = d3.extent(airports, d => d.outgoing);
  // scales.airports.domain(extent);

  // draw airport bubbles
  g.airports.selectAll("circle.airport")
    .data(airports, d => d.iata)
    .enter()
    .append("circle")
    .attr("r",  5)
    .attr("cx", d => d.x) // calculated on load
    .attr("cy", d => d.y) // calculated on load
    .attr("class", "airport")
    .each(function(d) {
      // adds the circle object to our airport
      // makes it fast to select airports on hover
      d.bubble = this;
    });
}

function distance(source, target) {
const dx2 = Math.pow(target.x - source.x, 2);
const dy2 = Math.pow(target.y - source.y, 2);

return Math.sqrt(dx2 + dy2);
}
// see airports.csv
// convert gps coordinates to number and init degree
function typeAirport(airport) {
airport.longitude = parseFloat(airport.longitude);
airport.latitude  = parseFloat(airport.latitude);

// use projection hard-coded to match topojson data
const coords = projection([airport.longitude, airport.latitude]);
airport.x = coords[0];
airport.y = coords[1];

airport.outgoing = 0;  // eventually tracks number of outgoing flights
airport.incoming = 0;  // eventually tracks number of incoming flights

airport.flights = [];  // eventually tracks outgoing flights

return airport;
}

// see flights.csv
// convert count to number
function typeFlight(flight) {
flight.count = parseInt(flight.count);
return flight;
}
