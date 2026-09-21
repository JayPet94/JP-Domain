const API = 'https://api.sleeper.app/v1';
const TIER_URLS = {
  standard: 'https://s3-us-west-1.amazonaws.com/fftiers/out/weekly-ALL.csv',
  half: 'https://s3-us-west-1.amazonaws.com/fftiers/out/weekly-ALL-HALF-PPR.csv',
  ppr: 'https://s3-us-west-1.amazonaws.com/fftiers/out/weekly-ALL-PPR.csv'
};
const TIER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1aeCDrRHeqY2oLdrcqfirsl4bjca3pcjUg3RP5fJrtyc/export?format=csv';

const state = { league: null, rosters: [], allRosters: [], users: [], players: null, tiers: new Map(), season: null };
const $ = (id) => document.getElementById(id);
const message = (text, type = '') => { $('league-message').textContent = text; $('league-message').className = `message ${type}`; };
const api = async (path) => { const response = await fetch(`${API}${path}`); if (!response.ok) throw new Error(`Sleeper returned ${response.status}`); return response.json(); };
const savedInputs = JSON.parse(localStorage.getItem('lineup-coach-inputs') || '{}');
if (savedInputs.leagueUrl) $('league-url').value = savedInputs.leagueUrl;

function leagueIdFromInput(value) {
  const match = value.trim().match(/(?:league|leagues)[^0-9]*(\d{10,})/i) || value.trim().match(/\b(\d{10,})\b/);
  return match ? match[1] : null;
}
function csvRows(text) {
  return text.trim().split(/\r?\n/).slice(1).map(line => {
    const fields = [...line.matchAll(/(?:^|,)\s*(?:"((?:[^"]|"")*)"|([^,]*))/g)].map(m => (m[1] ?? m[2] ?? '').replace(/""/g, '"').trim());
    return { rank: Number(fields[0]), name: fields[1], tier: Number(fields[2]), position: fields[3] };
  }).filter(row => row.name && row.position);
}
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function eligible(player, slot) {
  const position = player.position;
  if (slot === 'QB') return position === 'QB';
  if (slot === 'RB') return position === 'RB';
  if (slot === 'WR') return position === 'WR';
  if (slot === 'TE') return position === 'TE';
  if (slot === 'K') return position === 'K';
  if (slot === 'DEF' || slot === 'DST') return position === 'DST' || position === 'DEF';
  if (slot === 'FLEX' || slot === 'REC_FLEX') return ['RB','WR','TE'].includes(position) && (slot !== 'REC_FLEX' || ['WR','TE'].includes(position));
  if (slot === 'SUPER_FLEX' || slot === 'SUPERFLEX') return ['QB','RB','WR','TE'].includes(position);
  return false;
}
function isAvailable(player) {
  if (player.reserve) return false;
  const unavailable = ['out', 'ir', 'injured reserve', 'inactive', 'pup', 'suspended', 'doubtful'];
  const status = normalize(player.status).replace(/([a-z])([a-z])/g, '$1$2');
  const injuryStatus = normalize(player.injuryStatus);
  return !unavailable.some(value => status.includes(normalize(value)) || injuryStatus.includes(normalize(value)));
}
function availabilityLabel(player) {
  if (player.reserve) return 'IR/reserve';
  return player.injuryStatus || player.status || 'Unavailable';
}
function slotName(slot) { return slot.replace('SUPER_FLEX', 'SUPERFLEX').replace('_', ' '); }
function score(player) { return player.rank ?? 9999; }
function bestLineup(players, slots) {
  const source = 0;
  const playerStart = 1;
  const slotStart = playerStart + players.length;
  const sink = slotStart + slots.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const addEdge = (from, to, capacity, cost) => {
    graph[from].push({ to, capacity, cost, reverse: graph[to].length });
    graph[to].push({ to: from, capacity: 0, cost: -cost, reverse: graph[from].length - 1 });
  };
  players.forEach((player, index) => {
    addEdge(source, playerStart + index, 1, 0);
    slots.forEach((slot, slotIndex) => {
      if (isAvailable(player) && eligible(player, slot)) addEdge(playerStart + index, slotStart + slotIndex, 1, score(player));
    });
  });
  slots.forEach((slot, index) => addEdge(slotStart + index, sink, 1, 0));

  let flow = 0;
  while (flow < slots.length) {
    const distance = Array(graph.length).fill(Infinity);
    const previous = Array(graph.length);
    distance[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass += 1) {
      let changed = false;
      graph.forEach((edges, from) => edges.forEach((edge, edgeIndex) => {
        if (edge.capacity > 0 && distance[from] + edge.cost < distance[edge.to]) {
          distance[edge.to] = distance[from] + edge.cost;
          previous[edge.to] = [from, edgeIndex];
          changed = true;
        }
      }));
      if (!changed) break;
    }
    if (!previous[sink]) break;
    for (let node = sink; node !== source;) {
      const [from, edgeIndex] = previous[node];
      const edge = graph[from][edgeIndex];
      edge.capacity -= 1;
      graph[node][edge.reverse].capacity += 1;
      node = from;
    }
    flow += 1;
  }

  const lineup = [];
  const used = new Set();
  slots.forEach((slot, slotIndex) => {
    const slotNode = slotStart + slotIndex;
    const assignment = graph[slotNode].find(edge => edge.to >= playerStart && edge.to < slotStart && edge.capacity > 0);
    if (assignment) {
      const playerIndex = assignment.to - playerStart;
      lineup.push({ slot, player: players[playerIndex] });
      used.add(players[playerIndex].id);
    }
  });
  return { lineup, remaining: players.filter(player => !used.has(player.id)), total: lineup.reduce((sum, item) => sum + score(item.player), 0) };
}
function tierDataFor(player) { return state.tiers.get(normalize(player.name)) || state.tiers.get(normalize(player.fullName)); }
function displayName(player) { return player.name || player.fullName || 'Unknown player'; }
function freeAgentUpgrades(roster) {
  const rosteredIds = new Set(state.allRosters.flatMap(item => item.players || []));
  const available = Object.entries(state.players).map(([id, raw]) => {
    const name = `${raw.first_name || ''} ${raw.last_name || ''}`.trim();
    const position = raw.position === 'DEF' || !raw.position && /^[A-Z]{2,3}$/.test(id) ? 'DST' : raw.position;
    const tier = tierDataFor({ name, fullName: raw.full_name });
    return { id, name, position, tier, rank: tier?.rank, status: raw.status, injuryStatus: raw.injury_status };
  }).filter(player => !rosteredIds.has(player.id) && isAvailable(player) && player.tier && ['QB','RB','WR','TE','K','DST'].includes(player.position));
  const upgrades = [];
  for (const position of ['QB','RB','WR','TE','K','DST']) {
    const topAvailable = available.filter(player => player.position === position).sort((a, b) => score(a) - score(b)).slice(0, 50);
    const rosterPlayers = buildPlayers(roster).filter(player => player.position === position && player.tier);
    for (const freeAgent of topAvailable) {
      const worse = rosterPlayers.filter(player => freeAgent.tier.tier < player.tier.tier).sort((a, b) => b.tier.tier - a.tier.tier || score(b) - score(a))[0];
      if (worse) upgrades.push({ freeAgent, worse });
    }
  }
  return upgrades.sort((a, b) => a.freeAgent.tier.tier - b.freeAgent.tier.tier || score(a.freeAgent) - score(b.freeAgent));
}

async function loadTiers(scoring) {
  if (window.BORISCHEN_TIER_CSV) {
    state.tiers = new Map(csvRows(window.BORISCHEN_TIER_CSV).map(row => [normalize(row.name), row]));
    return '0.5 PPR';
  }
  const requested = TIER_URLS[scoring] || TIER_URLS.standard;
  let response = null;
  for (const url of [TIER_SHEET_URL, requested]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch {
      response = null;
    } finally {
      clearTimeout(timeout);
    }
    if (response?.ok) break;
  }
  if (!response?.ok) throw new Error('Could not load Borischen tier data. Check your internet connection and try again.');
  state.tiers = new Map(csvRows(await response.text()).map(row => [normalize(row.name), row]));
  return response.url === TIER_SHEET_URL ? 'standard' : scoring;
}
function scoringFormat(league) {
  const receptions = Number(league.scoring_settings?.rec ?? 0);
  return receptions >= 1 ? 'ppr' : receptions > 0 ? 'half' : 'standard';
}
function buildPlayers(roster) {
  const reserveIds = new Set(roster.reserve || []);
  return roster.players.map(id => {
    const raw = state.players[id];
    const name = raw ? `${raw.first_name || ''} ${raw.last_name || ''}`.trim() : id;
    const position = raw?.position === 'DEF' || !raw?.position && /^[A-Z]{2,3}$/.test(id) ? 'DST' : raw?.position;
    const tier = tierDataFor({ name, fullName: raw?.full_name });
    return { id, name, position: position || 'UNK', tier, rank: tier?.rank, reserve: reserveIds.has(id), status: raw?.status, injuryStatus: raw?.injury_status };
  }).filter(player => player.position !== 'UNK');
}
function renderResults(roster, slots, lineupResult, usedScoring) {
  $('results').classList.remove('hidden');
  $('results-title').textContent = `${roster.teamName || 'Your team'} starts here`;
  $('freshness').textContent = `Borischen ${usedScoring.toUpperCase()} tiers · ${new Date().toLocaleDateString()}`;
  const missing = lineupResult ? lineupResult.remaining : [];
  const unmatched = roster.players.filter(id => !state.players[id]);
  $('warning').classList.toggle('hidden', !unmatched.length);
  $('warning').textContent = unmatched.length ? `${unmatched.length} roster item(s) could not be matched to Sleeper's player database.` : '';
  $('lineup-grid').innerHTML = lineupResult ? lineupResult.lineup.map(({slot, player}) => {
    const tier = player.tier;
    return `<article class="lineup-card"><div class="slot">${slotName(slot)}</div><div class="tier"><span class="tier-mark">${tier?.tier ?? '—'}</span> Tier</div><div class="player-name">${displayName(player)}</div><div class="player-sub">${player.position} · ${tier ? `rank ${tier.rank}` : 'no tier match'}</div></article>`;
  }).join('') : '<p>No legal lineup could be built from this roster and its slots.</p>';
  $('bench-list').innerHTML = missing.map(player => `<div class="bench-player">${displayName(player)} <span>${player.position} · ${!isAvailable(player) ? availabilityLabel(player) : player.tier ? `T${player.tier.tier}` : 'unranked'}</span></div>`).join('') || '<span class="player-sub">No bench players.</span>';
  const upgrades = freeAgentUpgrades(roster);
  $('waiver-list').innerHTML = upgrades.map(({ freeAgent, worse }) => `<div class="waiver-card"><div class="waiver-player">${freeAgent.name}<span>${freeAgent.position} · Tier ${freeAgent.tier.tier} · rank ${freeAgent.rank}</span></div><div class="waiver-upgrade">Better than<br>${worse.name} · Tier ${worse.tier.tier}</div></div>`).join('') || '<div class="waiver-empty">No higher-tier free agents found in the top 50 at each position.</div>';
}

$('league-form').addEventListener('submit', async (event) => {
  event.preventDefault(); $('team-panel').classList.add('hidden'); $('results').classList.add('hidden'); message('Loading league, rosters, and player data…', 'loading');
  try {
    const leagueUrl = $('league-url').value.trim();
    const leagueId = leagueIdFromInput(leagueUrl);
    localStorage.setItem('lineup-coach-inputs', JSON.stringify({ leagueUrl }));
    if (!leagueId) throw new Error('Enter a valid Sleeper league link.');
    const [league, rosters, users] = await Promise.all([api(`/league/${leagueId}`), api(`/league/${leagueId}/rosters`), api(`/league/${leagueId}/users`)]);
    const usernameSelect = $('username-select');
    usernameSelect.innerHTML = users.map(user => `<option value="${user.user_id}">${user.username || user.display_name}</option>`).join('');
    usernameSelect.disabled = false;
    state.league = league; state.rosters = rosters; state.allRosters = rosters; state.users = users; state.players = await api('/players/nfl');
    $('league-meta').innerHTML = `<span class="meta-chip">${league.name}</span><span class="meta-chip">${league.season} season</span><span class="meta-chip">${users.length} usernames found</span>`;
    $('team-panel').classList.remove('hidden'); message('League connected. Choose a username, then build the recommendation.');
  } catch (error) { message(error.message || 'Could not load that league.', 'error'); }
});

$('analyze-button').addEventListener('click', async () => {
  const userId = $('username-select').value;
  const roster = state.rosters.find(item => item.owner_id === userId);
  if (!roster) { message('Choose a username with a roster before building.', 'error'); return; }
  const user = state.users.find(item => item.user_id === userId);
  roster.teamName = user?.metadata?.team_name || user?.display_name || user?.username || `Roster ${roster.roster_id}`;
  $('analyze-button').disabled = true; $('analyze-button').textContent = 'Building…';
  try {
    const usedScoring = await loadTiers(scoringFormat(state.league));
    const players = buildPlayers(roster); const slots = state.league.roster_positions.filter(slot => !['BN','IR','TAXI'].includes(slot));
    renderResults(roster, slots, bestLineup(players, slots), usedScoring);
  } catch (error) { message(error.message || 'Could not build the lineup.', 'error'); } finally { $('analyze-button').disabled = false; $('analyze-button').innerHTML = 'Build my lineup <span aria-hidden="true">→</span>'; }
});
