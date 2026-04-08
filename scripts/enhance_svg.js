const fs = require('fs');
const path = require('path');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function fetchContributionData(username) {
  if (!GITHUB_TOKEN) {
    console.log("⚠️ No GITHUB_TOKEN found. Tooltips will be generic.");
    return null;
  }

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
    console.log(`✅ Fetched contribution data for ${days.length} days.`);
    return days;
  } catch (error) {
    console.error("❌ Error fetching contribution data:", error);
    return null;
  }
}

async function enhanceSvg(filePath, contributionData) {
  if (!fs.existsSync(filePath)) {
    console.log(`❌ File not found: ${filePath}`);
    return;
  }

  console.log(`🔧 Enhancing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');

  // Inject CSS Styles
  const styleBlock = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&amp;display=swap');
    .cell-group { cursor: help; }
    .cell-group text.eat-msg { 
      display: none; 
      font-family: 'Fira Code', monospace; 
      font-size: 5px; 
      fill: #ffffff; 
      text-shadow: 1px 1px 1px black;
      pointer-events: none;
    }
    .cell-group:hover text.eat-msg { display: block; }
    .cell-group:hover rect { stroke: #fff; stroke-width: 0.5px; }
  </style>`;
  
  content = content.replace('</svg>', `${styleBlock}</svg>`);

  // Target each contribution cell
  const rectRegex = /<rect id="c-(\d+)-(\d+)"([^>]+)>([\s\S]*?)<\/rect>/g;
  let count = 0;
  
  content = content.replace(rectRegex, (match, x, y, attrs, inner) => {
    count++;
    const xIdx = parseInt(x);
    const yIdx = parseInt(y);
    const dayIdx = xIdx * 7 + yIdx;
    
    const dayData = contributionData ? contributionData[dayIdx] : null;
    const conCount = dayData ? dayData.contributionCount : '?';
    const date = dayData ? dayData.date : '';

    // Extract position for the text
    const xPos = parseFloat(attrs.match(/x="([\d.]+)"/)?.[1] || 0);
    const yPos = parseFloat(attrs.match(/y="([\d.]+)"/)?.[1] || 0);
    
    // Find the animation tag more broadly
    const animTagMatch = inner.match(/<animate[^>]*attributeName="fill"[^>]*>/);
    let eatenAnimation = '';
    
    if (animTagMatch) {
      const animTag = animTagMatch[0];
      const values = animTag.match(/values="([^"]*)"/)?.[1]?.split(';');
      const keyTimes = animTag.match(/keyTimes="([^"]*)"/)?.[1];
      const dur = animTag.match(/dur="([^"]*)"/)?.[1];
      
      if (values && keyTimes && dur) {
        // If the color changes from the first frame, it has been eaten
        const baseColor = values[0];
        const opacityValues = values.map(v => v === baseColor ? "0" : "1").join(';');
        eatenAnimation = `<animate attributeName="opacity" dur="${dur}" keyTimes="${keyTimes}" values="${opacityValues}" repeatCount="indefinite" />`;
      }
    }

    return `
    <g class="cell-group">
      ${match}
      <title>${conCount} contributions${date ? ' on ' + date : ''}</title>
      <text x="${xPos + 1}" y="${yPos + 11.5}" class="eat-msg" opacity="0">
        oh, pacman eats it
        ${eatenAnimation}
      </text>
    </g>`;
  });

  fs.writeFileSync(filePath, content);
  console.log(`✅ Finished processing ${count} cells.`);
}

async function main() {
  const username = process.env.GITHUB_REPOSITORY_OWNER || 'avilajohnluigi-debug';
  const data = await fetchContributionData(username);
  const targetFiles = ['dist/pacman-contribution-graph-dark.svg', 'dist/pacman-contribution-graph-light.svg'];
  
  for (const f of targetFiles) {
    await enhanceSvg(f, data);
  }
}

main();
