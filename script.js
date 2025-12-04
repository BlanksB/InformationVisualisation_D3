// ----- STEP 1 -----
// Load and filter the data
// Filter specifications:
//  - Class = Cognitive Decline
//  - Topic != Talked with health care professional about subjective cognitive decline or memory loss
//  - Stratification1 != Overall
//  - Data_Value not null
d3.csv("./Alzheimer's_Disease_and_Healthy_Aging_Data.csv", d => ({
  Class: d.Class,
  Topic: d.Topic,
  StratCat1: d.StratificationCategory1,
  Strat1: d.Stratification1,
  StratCat2: d.StratificationCategory2,
  Strat2: d.Stratification2,
  Value: d.Data_Value === "" ? null : +d.Data_Value // + coverts data to a number format
}))
  .then(rows => {
    //...check if total number of rows is correct
    console.log("Total rows loaded:", rows.length);

    // Filter rows based on specifications above
    const base = rows.filter(d =>
      d.Class === "Cognitive Decline" &&
      d.Topic !== "Talked with health care professional about subjective cognitive decline or memory loss" &&
      d.Strat1 !== "Overall" &&
      d.Value !== null
    );

    //...check if the number of remaining rows is feasible
    console.log("Filtered base rows:", base.length);

    // Save dataset (base) in the global namspece of the browser (window)
    window.__baseData__ = base;

    // Create SVG
    createSvg();

    // Find the dropdown menu with id='dimension'
    // If the user chnages the selection, the function updateGroupedChart() should be called
    d3.select("#dimension").on("change", function () {
      updateGroupedChart(this.value);
    });

    // Initial view: grouped by Sex
    updateGroupedChart("sex");
  });


// ----- STEP 2 -----
// Declare width and height 
// Create the SVG
function createSvg() {
  const width = 900, height = 520;

  const svg = d3.select("#bar")
    .append("svg")
    .attr("viewBox", [0, 0, width, height]);

    // Save the SVG globally as well
  window.__svg__ = svg;
}


// One big function that creates the chart, and updates it's values based on the slicer selection
function updateGroupedChart(mode) {
  const svg = window.__svg__;
  const base = window.__baseData__;

  // Remove all previous elements from SVG
  // Will be refilled again
  svg.selectAll("*").remove();

  // ----- STEP 3 -----
  // Create the visual with it's measurements
  const width = 900, height = 520;
  const margins = { top: 30, right: 200, bottom: 80, left: 60 };

  // Only keep rows where StratCat1 is "Age Group"
  const ageLayer = base.filter(d => d.StratCat1 === "Age Group");

  // ----- STEP 4 -----
  let rows;
  let dimLabel;

  // Set dimLabel to sex/ethnicity (based on mode variable) to use as filter in dataset
  // Filter the dataset in the column StratificationCategory2
  if (mode === "sex") {
    dimLabel = "Sex";
    rows = ageLayer.filter(d => 
      d.StratCat2 === "Sex");
  } else {
    dimLabel = "Ethnicity";
    rows = ageLayer.filter(d =>
      d.StratCat2 &&
      (d.StratCat2.includes("Race") || d.StratCat2.includes("Ethnic"))
    );
  }

  //...check if the number of remaining rows is feasible
  console.log(`Rows after age + ${dimLabel} filter:`, rows.length);

  // ----- STEP 5 ------
  // Compute the mean value per age group and sex/ethnicity
  // d3.rollup() Groups and reduces the specified iterable of values into an InternMap from key to reduced value
  const nested = d3.rollup(
    rows,
    v => d3.mean(v, d => d.Value),
    d => d.Strat1,  // age group
    d => d.Strat2   // sex/ethnicity
  );
  
  // outer groups 
  const ageGroups = Array.from(nested.keys()).sort();  
  // inner groups
  const categories = Array.from(new Set(rows.map(d => d.Strat2))).sort();                                            

  //...check if the age groups and categories withing the selectection are correct
  console.log("Age groups:", ageGroups);
  console.log(`${dimLabel} categories:`, categories);

  // Flatten into an array [{age group, sex/ethnicity, mean value}, ...]
  const flatData = [];
  for (const [age, catMap] of nested.entries()) {
    for (const [cat, val] of catMap.entries()) {
      flatData.push({
        AgeGroup: age,
        Category: cat,
        Value: val
      });
    }
  }

  // ----- STEP 5 -----
  // Create the scale to map the data range with the domain on the screen
  // x axis outer group: age groups
  const x0 = d3.scaleBand()         
    .domain(ageGroups)
    .rangeRound([margins.left, width - margins.right])
    .paddingInner(0.1);

  // x axis inner: categories inside each age group (sex/ethnicity)
  const x1 = d3.scaleBand()         
    .domain(categories)
    .rangeRound([0, x0.bandwidth()])
    .padding(0.05);

  // y axis 
  // .nice() rounds the upper bound number
  const y = d3.scaleLinear()
    .domain([0, d3.max(flatData, d => d.Value)]).nice()
    .range([height - margins.bottom, margins.top]);

  // Add a color palette
  const palette = d3.schemeSet2 || d3.schemeCategory10;

  const color = d3.scaleOrdinal()
    .domain(categories)
    .range(palette);

  // ----- STEP 6 -----
  // Create the groups (age groups)
  const ageGroupsG = svg.append("g")
    .selectAll("g")
    .data(ageGroups)
    .join("g")
      .attr("transform", age => `translate(${x0(age)},0)`);

  // ----- STEP 7 -----
  // Create the rectangle elements for the bar chart
  ageGroupsG.selectAll("rect")
    .data(age => categories.map(cat => {
      // Find data that corresponds to the age group and category (sex/ethnicity)
      const found = flatData.find(d => d.AgeGroup === age && d.Category === cat);
      return {
        AgeGroup: age,
        Category: cat,
        Value: found ? found.Value : 0
      };
    }))
    // The rectangles start out with 0 height from the baseline ("height", 0)
    .join("rect")
      .attr("x", d => x1(d.Category))
      .attr("y", d => y(0))
      .attr("width", x1.bandwidth())
      .attr("height", 0)
      .attr("fill", d => color(d.Category))
    // Add a transition (animation) that smoothly chnages the bar heights over 700ms
    .transition()
      .duration(700)
      .attr("y", d => y(d.Value))
      .attr("height", d => y(0) - y(d.Value));

  // Add tooltips to the bars
  ageGroupsG.selectAll("rect")
    .append("title")
    .text(d =>
      `Age group: ${d.AgeGroup}\n${dimLabel}: ${d.Category}\nAverage percentage: ${d.Value.toFixed(2)}`
    );

  // ----- STEP 8 -----
  // Add axes
  const xAxis = d3.axisBottom(x0);
  const yAxis = d3.axisLeft(y);

  svg.append("g")
    .attr("transform", `translate(0,${height - margins.bottom})`)
    .call(xAxis)
    .selectAll("text")
      .style("text-anchor", "middle");

  svg.append("g")
    .attr("transform", `translate(${margins.left},0)`)
    .call(yAxis);

  // ----- STEP 9 -----
  // Add the title
  svg.append("text")
    .attr("x", margins.left)
    .attr("y", margins.top - 10)
    .style("font-size", "14px")
    .style("font-weight", "bold")
    .text(`Average reported percentage of cognitive decline by Age Group and ${dimLabel}`);

  // Add the legend on the right side, centered vertically
  const legend = svg.append("g")
    .attr("transform", `translate(${width - margins.right + 20}, ${margins.top + 10})`);

  // Create each row in the legend
  // Add a colored rectangle, and category name
  categories.forEach((cat, i) => {
    const g = legend.append("g")
      .attr("transform", `translate(0, ${i * 20})`);

    g.append("rect")
      .attr("x", 0)
      .attr("y", -8)
      .attr("width", 14)
      .attr("height", 14)
      .attr("rx", 2)
      .attr("ry", 2)
      .attr("fill", color(cat));

    g.append("text")
      .attr("x", 20)
      .attr("y", 0)
      .attr("dy", "0.35em")
      .style("font-size", "11px")
      .text(cat);
  });
}
