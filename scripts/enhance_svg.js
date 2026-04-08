const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function fetchContributionData(username) {
  if (!GITHUB_TOKEN) return null;
  const query = `query($userName:String!) { user(login: $userName) { contributionsCollection { contributionCalendar { weeks { contributionDays { contributionCount date } } } } } }`;
  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { userName: username } }),
    });
    const data = await response.json();
    const days = [];
    data.data.user.contributionsCollection.contributionCalendar.weeks.forEach(week => {
      week.contributionDays.forEach(day => { days.push(day); });
    });
    console.log(`✅ Fetched data for ${days.length} days.`);
    return days;
  } catch (error) { return null; }
}

async function enhanceSvg(filePath, contributionData) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');

  const styleBlock = `
  <style>
    .cell-group { cursor: help; }
    .cell-group text.eat-msg { 
      display: none; 
      font-family: Arial, sans-serif; 
      font-size: 8px; 
      font-weight: bold;
      fill: #ff0000; /* Bright Red so it's super obvious */
      text-shadow: 1px 1px 0px white;
      pointer-events: none;
    }
    .cell-group:hover text.eat-msg { display: block; }
    .cell-group:hover rect { stroke: #fff; stroke-width: 1px; }
  </style>`;
  
  content = content.replace('</svg>', `${styleBlock}</svg>`);

  const rectRegex = /<rect id="c-(\d+)-(\d+)"([^>]+)>([\s\S]*?)<\/rect>/g;
  let processed = 0;
  
  content = content.replace(rectRegex, (match, x, y, attrs, inner) => {
    processed++;
    const dayIdx = parseInt(x) * 7 + parseInt(y);
    const dayData = contributionData ? contributionData[dayIdx] : null;
    const conCount = dayData ? dayData.contributionCount : '?';
    const date = dayData ? dayData.date : '';

    const xPos = parseFloat(attrs.match(/x="([\d.]+)"/)?.[1] || 0);
    const yPos = parseFloat(attrs.match(/y="([\d.]+)"/)?.[1] || 0);
    
    const animTagMatch = inner.match(/<animate[^>]*attributeName="fill"[^>]*>/);
    let eatenAnimation = '';
    
    if (animTagMatch) {
      const animTag = animTagMatch[0];
      const values = animTag.match(/values="([^"]*)"/)?.[1]?.split(';');
      const keyTimes = animTag.match(/keyTimes="([^"]*)"/)?.[1];
      const dur = animTag.match(/dur="([^"]*)"/)?.[1];
      
      if (values && keyTimes && dur) {
        const baseColor = values[0].toLowerCase();
        // Show message only when the color is NOT the starting color (meaning it was eaten)
        const opacityValues = values.map(v => v.toLowerCase() === baseColor ? "0" : "1").join(';');
        eatenAnimation = `<animate attributeName="opacity" dur="${dur}" keyTimes="${keyTimes}" values="${opacityValues}" repeatCount="indefinite" />`;
      }
    }

    return `
    <g class="cell-group">
      ${match}
      <title>${conCount} contributions on ${date}</title>
      <text x="${xPos - 5}" y="${yPos + 10}" class="eat-msg" opacity="0">
        OH! EATEN!
        ${eatenAnimation}
      </text>
    </g>`;
  });

  fs.writeFileSync(filePath, content);
  console.log(`✅ Processed ${processed} cells in ${filePath}.`);
}

async function main() {
  const username = process.env.GITHUB_REPOSITORY_OWNER;
  const data = await fetchContributionData(username);
  const targetFiles = ['dist/pacman-contribution-graph-dark.svg', 'dist/pacman-contribution-graph-light.svg'];
  for (const f of targetFiles) {
    await enhanceSvg(f, data);
  }
}
main();
