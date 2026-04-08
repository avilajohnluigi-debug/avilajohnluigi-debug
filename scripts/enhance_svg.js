const fs = require('fs');
const path = require('path');

// To run this locally, you'd need a GITHUB_TOKEN. In Actions, it's automatic.
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function fetchContributionData(username) {
  if (!GITHUB_TOKEN) {
    console.log("No GITHUB_TOKEN found. Tooltips will be generic.");
    return null;
  }

  const query = `
    query($userName:String!) {
      user(login: $userName) {
        contributionsCollection {
          contributionCalendar {
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables: { userName: username } }),
    });

    const data = await response.json();
    const days = [];
    data.data.user.contributionsCollection.contributionCalendar.weeks.forEach(week => {
      week.contributionDays.forEach(day => {
        days.push(day);
      });
    });
    return days;
  } catch (error) {
    console.error("Error fetching contribution data:", error);
    return null;
  }
}

async function enhanceSvg(filePath, contributionData) {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }

  console.log(`Enhancing ${filePath}...`);
  let content = fs.readFileSync(filePath, 'utf8');

  // Styles block
  const styleBlock = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&amp;display=swap');
    .cell-group { cursor: pointer; }
    .cell-group text.eat-msg { 
      display: none; 
      font-family: 'Fira Code', monospace; 
      font-size: 5px; 
      fill: #ffffff; 
      text-shadow: 1px 1px 1px black;
      pointer-events: none;
    }
    .cell-group:hover text.eat-msg { 
      display: block; 
    }
    .cell-group:hover rect {
      stroke: #fff;
      stroke-width: 0.5px;
    }
  </style>
  `;
  
  content = content.replace('</svg>', `${styleBlock}</svg>`);

  const rectRegex = /<rect id="c-(\d+)-(\d+)"([^>]+)>([\s\S]*?)<\/rect>/g;
  
  content = content.replace(rectRegex, (match, x, y, attrs, inner) => {
    const xIdx = parseInt(x);
    const yIdx = parseInt(y);
    
    const dayIdx = xIdx * 7 + yIdx;
    const dayData = contributionData ? contributionData[dayIdx] : null;
    const count = dayData ? dayData.contributionCount : '?';
    const date = dayData ? dayData.date : '';

    const xPosMatch = attrs.match(/x="([\d.]+)"/);
    const yPosMatch = attrs.match(/y="([\d.]+)"/);
    const widthMatch = attrs.match(/width="([\d.]+)"/);
    
    if (!xPosMatch || !yPosMatch || !widthMatch) return match;
    
    const xPos = parseFloat(xPosMatch[1]);
    const yPos = parseFloat(yPosMatch[1]);
    const width = parseFloat(widthMatch[1]);
    
    // MODIFIED: More robust animation matching
    const animTagMatch = inner.match(/<animate attributeName="fill"[^>]*>/);
    let eatenAnimation = '';
    
    if (animTagMatch) {
      const animTag = animTagMatch[0];
      const valuesMatch = animTag.match(/values="([^"]*)"/);
      const keyTimesMatch = animTag.match(/keyTimes="([^"]*)"/);
      const durMatch = animTag.match(/dur="([^"]*)"/);
      
      if (valuesMatch && keyTimesMatch && durMatch) {
        const values = valuesMatch[1].split(';');
        const keyTimes = keyTimesMatch[1];
        const dur = durMatch[1];
        
        const initialColor = values[0];
        const opacityValues = values.map(v => v === initialColor ? "0" : "1").join(';');
        eatenAnimation = `<animate attributeName="opacity" dur="${dur}" keyTimes="${keyTimes}" values="${opacityValues}" repeatCount="indefinite" />`;
      }
    }

    return `
    <g class="cell-group">
      ${match}
      <title>${count} contributions${date ? ' on ' + date : ''}</title>
      <text x="${xPos + 1}" y="${yPos + (width/2) + 1.5}" class="eat-msg" opacity="0">
        oh, pacman eats it
        ${eatenAnimation}
      </text>
    </g>`;
  });

  fs.writeFileSync(filePath, content);
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
