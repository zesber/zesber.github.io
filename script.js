// Define the slides, titles and subtitles
const slidesData = [
    { title: "Electric Car Registrations Over Time", description: "This chart shows the trends in eletric car registrations over time.", data: null },
    { title: "Electric Car Registrations by Type", description: "This chart shows the trends in electric car registrations by type. Types include Plug-in Hybrid Electric Vehicle (PHEV) and Battery Electric Vehicle (BEV).", data: null },
    { title: "Battery Electric Vehicle Dominance by County", description: "This map shows the proportion of battery powered electric vehicle registrations per county population.", data: null }
];

// Start slideshow at first scene
let currentSlideIndex = 0;


function loadData() {
    // Retrieve EV registration data and population counts from WA repository
    Promise.all([
        fetch("https://data.wa.gov/resource/2hia-rqet.json")
            .then(response => response.json()),
        fetch("https://data.wa.gov/api/views/f6w7-q2d2/rows.json")
            .then(response => response.json())
    ]).then(([populationData, evData]) => {
        const populationByCounty = {};
        const bevByCounty = {};

        
        populationData.forEach(entry => {
            const county = entry.county;
            const population = +entry.pop_2023; 
            if (!populationByCounty[county]) {
                populationByCounty[county] = 0;
            }
            populationByCounty[county] += population;
        });

        const rawEntries = evData.data;
        const registrationsByYearAndType = {};
        const registrationsByCounty = {};

        rawEntries.forEach(entry => {
            const modelYear = entry[13]; 
            const evType = entry[16]; 
            const county = entry[9]; 

            if (!registrationsByYearAndType[modelYear]) {
                registrationsByYearAndType[modelYear] = { PHEV: 0, BEV: 0 };
            }
            if (evType === "Plug-in Hybrid Electric Vehicle (PHEV)") {
                registrationsByYearAndType[modelYear].PHEV += 1;
            } else if (evType === "Battery Electric Vehicle (BEV)") {
                registrationsByYearAndType[modelYear].BEV += 1;
            }

            if (!registrationsByCounty[county]) {
                registrationsByCounty[county] = { PHEV: 0, BEV: 0 };
            }
            if (evType === "Battery Electric Vehicle (BEV)") {
                registrationsByCounty[county].BEV += 1;
            }
        });

        const formattedData = Object.keys(registrationsByYearAndType).sort().map(year => ({
            Year: year,
            PHEV: registrationsByYearAndType[year].PHEV,
            BEV: registrationsByYearAndType[year].BEV
        }));

        const bevPercentageByCounty = {};
        for (const county in registrationsByCounty) {
            if (populationByCounty[county]) {
                bevPercentageByCounty[county] = (registrationsByCounty[county].BEV / populationByCounty[county]) * 100;
            } else {
                bevPercentageByCounty[county] = 0;
            }
        }

        slidesData[0].data = formattedData;
        slidesData[1].data = formattedData;
        slidesData[2].data = bevPercentageByCounty; 

        updateSlide(currentSlideIndex);

    }).catch(error => console.error('Error loading the data:', error));
}


function updateSlide(index) {
    d3.select("#slideshow").html('');

    const slide = d3.select("#slideshow").append("div")
        .attr("class", "slide active");
    slide.append("h2").text(slidesData[index].title);
    slide.append("p").text(slidesData[index].description);

    if (slidesData[index].data) {
        const svg = slide.append("svg").attr("width", 800).attr("height", 450);
        if (index === 0) {
            drawBarChart(svg, slidesData[index].data);
        } else if (index === 1) {
            drawStackedBarChart(svg, slidesData[index].data);
        } else if (index === 2) {
            drawCountyMap(svg, slidesData[index].data);
        }
    }
}

function drawBarChart(svg, data) {
    const margin = { top: 20, right: 20, bottom: 30, left: 40 },
        width = +svg.attr("width") - margin.left - margin.right,
        height = +svg.attr("height") - margin.top - margin.bottom,
        g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    let x = d3.scaleBand().rangeRound([0, width]).padding(0.1).domain(data.map(d => d.Year));
    let y = d3.scaleLinear().rangeRound([height, 0]).domain([0, d3.max(data, d => d.PHEV + d.BEV)]);

    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("text-align", "center")
        .style("width", "160px")
        .style("height", "auto")
        .style("padding", "10px")
        .style("font", "12px sans-serif")
        .style("background", "white")
        .style("border", "1px solid #ccc")
        .style("border-radius", "8px")
        .style("pointer-events", "none");

    g.append("g")
        .attr("class", "axis axis--x")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));

    g.append("g")
        .attr("class", "axis axis--y")
        .call(d3.axisLeft(y).ticks(10))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", "0.71em")
        .attr("text-anchor", "end")
        .text("Registrations");

    const bars = g.selectAll(".bar")
        .data(data)
        .enter().append("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.Year))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.PHEV + d.BEV))
        .attr("height", d => height - y(d.PHEV + d.BEV))
        .on("mouseover", (event, d) => {
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(`Year: ${d.Year}<br/>Total: ${d.PHEV + d.BEV}`)
                .style("left", (event.pageX) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", () => {
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    const brush = d3.brushX()
        .extent([[0, 0], [width, height]])
        .on("end", brushended);

    const brushGroup = g.append("g")
        .attr("class", "brush")
        .call(brush);

    function brushended(event) {
        if (!event.selection) return;
        const [x0, x1] = event.selection.map(d => x.domain()[Math.floor(d / (width / x.domain().length))]);
        const brushedData = data.filter(d => d.Year >= x0 && d.Year <= x1);
        updateBarChart(svg, brushedData);
    }

    function updateBarChart(svg, brushedData) {
        x.domain(brushedData.map(d => d.Year));
        y.domain([0, d3.max(brushedData, d => d.PHEV + d.BEV)]);

        g.selectAll(".bar")
            .data(brushedData)
            .join("rect")
            .attr("class", "bar")
            .attr("x", d => x(d.Year))
            .attr("width", x.bandwidth())
            .attr("y", d => y(d.PHEV + d.BEV))
            .attr("height", d => height - y(d.PHEV + d.BEV));

        g.select(".axis--x").call(d3.axisBottom(x));
        g.select(".axis--y").call(d3.axisLeft(y));
    }

    // Reset Button
    const resetButton = svg.append("g")
    .attr("transform", `translate(${width - 50},${margin.top + 10})`);  // Adjusted position

    resetButton.append("rect")
        .attr("width", 100)
        .attr("height", 20)
        .attr("fill", "lightgray")
        .style("cursor", "pointer")
        .on("click", resetBrush);

    resetButton.append("text")
        .attr("x", 50)
        .attr("y", 10)
        .attr("dy", ".35em")
        .attr("text-anchor", "middle")
        .text("Reset Filter")
        .style("pointer-events", "none");

    function resetBrush() {
        brushGroup.call(brush.move, null);
        updateBarChart(svg, data);
    }
}

function drawStackedBarChart(svg, data) {
    const margin = { top: 20, right: 20, bottom: 30, left: 40 },
        width = +svg.attr("width") - margin.left - margin.right,
        height = +svg.attr("height") - margin.top - margin.bottom,
        g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    let x = d3.scaleBand()
        .rangeRound([0, width])
        .padding(0.1)
        .domain(data.map(d => d.Year));

    let y = d3.scaleLinear()
        .rangeRound([height, 0])
        .domain([0, d3.max(data, d => d.PHEV + d.BEV)]);

    const color = d3.scaleOrdinal()
        .range(["#ff8c00", "#6b486b"]);

    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("text-align", "center")
        .style("width", "160px")
        .style("height", "auto")
        .style("padding", "10px")
        .style("font", "12px sans-serif")
        .style("background", "white")
        .style("border", "1px solid #ccc")
        .style("border-radius", "8px")
        .style("pointer-events", "none");

    const stack = d3.stack().keys(["PHEV", "BEV"]);
    let layers = stack(data);

    g.append("g")
        .attr("class", "axis axis--x")
        .attr("transform", `translate(0,${height})`)
        .call(d3.axisBottom(x));

    g.append("g")
        .attr("class", "axis axis--y")
        .call(d3.axisLeft(y).ticks(10))
        .append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 6)
        .attr("dy", "0.71em")
        .attr("text-anchor", "end")
        .text("Registrations");

    const layer = g.selectAll(".layer")
        .data(layers)
        .enter().append("g")
        .attr("class", "layer")
        .attr("fill", d => color(d.key));

    layer.selectAll("rect")
        .data(d => d)
        .enter().append("rect")
        .attr("x", d => x(d.data.Year))
        .attr("width", x.bandwidth())
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]))
        .on("mouseover", (event, d) => {
            tooltip.transition()
                .duration(200)
                .style("opacity", .9);
            tooltip.html(`Year: ${d.data.Year}<br/>PHEV: ${d.data.PHEV}<br/>BEV: ${d.data.BEV}<br/>Total: ${d.data.PHEV + d.data.BEV}`)
                .style("left", (event.pageX + 20) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", () => {
            tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });

    // Add annotation to indicate the highest bar in bar chart
    const largestYearData = data.reduce((max, d) => (d.PHEV + d.BEV > max.PHEV + max.BEV ? d : max), data[0]);
    const largestYear = largestYearData.Year;
    const largestYearPHEV = largestYearData.PHEV;
    const largestYearBEV = largestYearData.BEV;

    const annotationX = x(largestYear) + x.bandwidth() + 25; 
    const annotationY = y(largestYearPHEV + largestYearBEV) + 30; 

    svg.append("text")
        .attr("x", annotationX)
        .attr("y", annotationY)
        .attr("dy", "-0.5em")
        .attr("text-anchor", "middle")
        .attr("fill", "red")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text(`Year: ${largestYear}`);

    svg.append("text")
        .attr("x", annotationX)
        .attr("y", annotationY)
        .attr("dy", "1em")
        .attr("text-anchor", "middle")
        .attr("fill", "red")
        .style("font-size", "12px")
        .text(`BEV: ${largestYearBEV}`);

    const checkboxContainer = svg.append("foreignObject")
        .attr("x", width + margin.right - 30)
        .attr("y", margin.top)
        .attr("width", 120)
        .attr("height", 60)
        .append("xhtml:div")
        .attr("id", "checkbox-container");

    checkboxContainer.append("input")
        .attr("type", "checkbox")
        .attr("id", "checkbox-PHEV")
        .attr("checked", true)
        .on("change", updateChart);

    checkboxContainer.append("label")
        .attr("for", "checkbox-PHEV")
        .text("PHEV")
        .attr("color", "#ff8c00");

        
    checkboxContainer.append("br");

    checkboxContainer.append("input")
        .attr("type", "checkbox")
        .attr("id", "checkbox-BEV")
        .attr("checked", true)
        .on("change", updateChart);

    checkboxContainer.append("label")
        .attr("for", "checkbox-BEV")
        .text("BEV")
        .attr("color", "red");

        const legend = svg.append("g")
        .attr("class", "legend")
        .attr("transform", `translate(${width - 100},${margin.top})`);

    legend.append("rect")
        .attr("x", -550)
        .attr("y", 0)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "#6b486b");

    legend.append("text")
        .attr("x", -530)
        .attr("y", 10)
        .attr("dy", "-0.2em")
        .style("font-size", "12px")
        .style("fill", "#6b486b")
        .text("PHEV");

    legend.append("rect")
        .attr("x", -550)
        .attr("y", 20)
        .attr("width", 10)
        .attr("height", 10)
        .attr("fill", "#ff8c00");

    legend.append("text")
        .attr("x", -530)
        .attr("y", 30)
        .attr("dy", "-0.2em")
        .style("font-size", "12px")
        .style("fill", "#ff8c00")
        .text("BEV");

    function updateChart() {
        const keys = [];
        if (d3.select("#checkbox-PHEV").property("checked")) keys.push("PHEV");
        if (d3.select("#checkbox-BEV").property("checked")) keys.push("BEV");

        const updatedStack = d3.stack().keys(keys);
        const updatedLayers = updatedStack(data);

        y.domain([0, d3.max(data, d => keys.reduce((acc, key) => acc + d[key], 0))]);
        g.selectAll(".axis--y").call(d3.axisLeft(y).ticks(10));

        const updatedLayer = g.selectAll(".layer")
            .data(updatedLayers);

        updatedLayer.exit().remove();

        updatedLayer.enter().append("g")
            .attr("class", "layer")
            .attr("fill", d => color(d.key))
            .merge(updatedLayer)
            .selectAll("rect")
            .data(d => d)
            .join("rect")
            .attr("x", d => x(d.data.Year))
            .attr("width", x.bandwidth())
            .attr("y", d => y(d[1]))
            .attr("height", d => y(d[0]) - y(d[1]));
    }

    updateChart(); 
}



function drawCountyMap(svg, data) {
    const width = +svg.attr("width");
    const height = +svg.attr("height");

    const projection = d3.geoAlbers()
        .center([0, 47]) 
        .rotate([120, 0]) 
        .parallels([45, 55]) 
        .scale(8000) 
        .translate([width / 2, height / 2]);

    const path = d3.geoPath()
        .projection(projection);

    // Color to match BEV in previous slide
    const color = d3.scaleSequential(d3.interpolateOranges)
        .domain([0, d3.max(Object.values(data))]);

    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0)
        .style("position", "absolute")
        .style("text-align", "center")
        .style("width", "160px")
        .style("height", "auto")
        .style("padding", "10px")
        .style("font", "12px sans-serif")
        .style("background", "white")
        .style("border", "1px solid #ccc")
        .style("border-radius", "8px")
        .style("pointer-events", "none");

    // County coordinates needed to plot map
    d3.json("https://raw.githubusercontent.com/plotly/datasets/master/geojson-counties-fips.json").then(countyData => {

        // Remove other state data
        const washingtonCounties = countyData.features.filter(d => d.properties.STATE === "53");

        svg.selectAll("path")
            .data(washingtonCounties)
            .enter().append("path")
            .attr("d", path)
            .attr("fill", d => {
                const countyName = d.properties.NAME;
                const bevPercentage = data[countyName] || 0;
                return color(bevPercentage);
            })
            .on("mouseover", (event, d) => {
                const countyName = d.properties.NAME;
                const bevPercentage = data[countyName] || 0;
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                tooltip.html(`County: ${countyName}<br/>BEV Percentage: ${bevPercentage.toFixed(2)}%`)
                    .style("left", (event.pageX) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", () => {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            });
        
        // Add annotation for Seattle based on rough lat/long
        const seattleCoords = [-122.3321, 47.6062]; 
        const seattleProjected = projection(seattleCoords);

        svg.append("circle")
            .attr("cx", seattleProjected[0])
            .attr("cy", seattleProjected[1])
            .attr("r", 5)
            .attr("fill", "red");

        svg.append("text")
            .attr("x", seattleProjected[0] + 10)
            .attr("y", seattleProjected[1] + 5)
            .attr("fill", "black")
            .style("font-size", "12px")
            .style("font-weight", "bold")
            .text("Seattle");
    }).catch(error => console.error('Error loading the GeoJSON data:', error));
}

function nextSlide() {
    currentSlideIndex = (currentSlideIndex + 1) % slidesData.length;
    updateSlide(currentSlideIndex);
}

function prevSlide() {
    currentSlideIndex = (currentSlideIndex - 1 + slidesData.length) % slidesData.length;
    updateSlide(currentSlideIndex);
}

document.addEventListener("DOMContentLoaded", function() {
    loadData(); 
    document.getElementById("next").addEventListener("click", nextSlide);
    document.getElementById("prev").addEventListener("click", prevSlide);
});
