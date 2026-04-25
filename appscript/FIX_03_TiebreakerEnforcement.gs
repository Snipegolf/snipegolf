// =============================================
// SnipeGolf — FIX_03_TiebreakerEnforcement.gs
// PART A: Validates tiebreaker is one of 4 picks at entry time.
// PART B: Replaces plain .sort() in calculateLeaderboard()
//         with proper 3-tier sort:
//           1. TotalScore (low wins)
//           2. Tiebreaker player final score (low wins)
//           3. LastName alphabetical
//
// SCHEMA:
//   Participants: Tiebreaker = col11 (0-indexed)
//   Scores: GolferName col1, TotalScore col7 (0-indexed)
//   Leaderboard: Rank col0, EntryID col3, TotalScore col10 (0-indexed)
// =============================================


// PART A — Entry-time validation
// Call before writing to Participants sheet
function validateTiebreakerPresent(tiebreakerValue, picks) {
  var tb = (tiebreakerValue || '').trim();

  if (!tb) {
    return {
      ok: false,
      error: 'A tiebreaker selection is required. Choose one of your 4 picks. ' +
             'If scores are tied, the participant whose tiebreaker golfer finishes highest wins.'
    };
  }

  if (picks) {
    var allPicks = [picks.p1, picks.p2, picks.p3, picks.p4]
      .map(function(p) { return (p || '').trim().toLowerCase(); })
      .filter(Boolean);

    if (allPicks.length > 0 && allPicks.indexOf(tb.toLowerCase()) === -1) {
      return {
        ok: false,
        error: 'Your tiebreaker must be one of your 4 picks. "' + tb + '" is not in your selections.'
      };
    }
  }

  return { ok: true, error: null };
}


// PART B — Leaderboard sort with tiebreaker
// @param rows - array of leaderboard row objects with .totalScore, .tieBreaker, .lastName
// @param scoresMap - { 'golfer name lowercase': finalTotalScore }
// @returns sorted rows with .rank assigned
function applyTiebreakerSort(rows, scoresMap) {
  var MC_SCORE = 999; // fallback if tiebreaker player MC'd or missing

  rows.forEach(function(row) {
    var tb = (row.tieBreaker || '').trim();
    if (tb && scoresMap[tb.toLowerCase()] !== undefined) {
      row.tbScore = Number(scoresMap[tb.toLowerCase()]);
    } else {
      row.tbScore = MC_SCORE;
    }
  });

  rows.sort(function(a, b) {
    if (a.totalScore !== b.totalScore) return a.totalScore - b.totalScore;
    if (a.tbScore    !== b.tbScore)    return a.tbScore    - b.tbScore;
    return (a.lastName || '').localeCompare(b.lastName || '');
  });

  // Assign ranks — tied total+tiebreaker = same rank
  for (var i = 0; i < rows.length; i++) {
    if (i === 0) {
      rows[i].rank = 1;
    } else {
      var prev = rows[i - 1], curr = rows[i];
      if (curr.totalScore === prev.totalScore && curr.tbScore === prev.tbScore) {
        curr.rank = prev.rank;
      } else {
        curr.rank = i + 1;
      }
    }
  }

  return rows;
}


// Convenience wrapper — reads live Scores sheet and builds scoresMap
// Use this inside calculateLeaderboard() instead of plain .sort()
function sortLeaderboardWithTiebreaker(participantRows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var scoresSheet = ss.getSheetByName('Scores');
  var scoresMap = {};

  if (scoresSheet) {
    var scoreData = scoresSheet.getDataRange().getValues();
    for (var i = 1; i < scoreData.length; i++) {
      var name  = (scoreData[i][1] || '').toString().trim();  // GolferName col1
      var total = parseFloat(scoreData[i][7]);                 // TotalScore col7
      if (name && !isNaN(total)) scoresMap[name.toLowerCase()] = total;
    }
  }

  return applyTiebreakerSort(participantRows, scoresMap);
}


// TEST — Run via Extensions > Apps Script > Run > testTiebreakerSort
function testTiebreakerSort() {
  var fakeScores = {
    'rory mcilroy': -20, 'jon rahm': -18, 'scottie scheffler': -15,
    'brooks koepka': -10, 'collin morikawa': -8
  };

  var rows = [
    { lastName: 'Murphy',  totalScore: -48, tieBreaker: 'Rory McIlroy' },
    { lastName: 'Brien',   totalScore: -48, tieBreaker: 'Jon Rahm' },
    { lastName: 'O Shea',  totalScore: -48, tieBreaker: '' },
    { lastName: 'Walsh',   totalScore: -40, tieBreaker: 'Brooks Koepka' },
    { lastName: 'Collins', totalScore: -40, tieBreaker: 'Collin Morikawa' }
  ];

  var sorted = applyTiebreakerSort(rows, fakeScores);
  Logger.log('FIX_03 SORT TEST:');
  sorted.forEach(function(r) {
    Logger.log('  Rank ' + r.rank + ': ' + r.lastName + ' | Score: ' + r.totalScore + ' | TB: ' + (r.tieBreaker||'NONE') + ' | TB score: ' + r.tbScore);
  });

  var pass = sorted[0].lastName === 'Murphy' && sorted[1].lastName === 'Brien' && sorted[2].lastName === 'O Shea';
  Logger.log(pass ? 'ALL ASSERTIONS PASS ✅' : 'CHECK ORDER ABOVE ❌');
}
