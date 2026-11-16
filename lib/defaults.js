'use strict';

// Groups created the first time the app starts. Teachers can add, edit or
// remove groups afterwards from /teacher → Classes & VIP.
const DEFAULT_GROUPS = [
  ['7A', '7 Archimedes (7A)', '#00b8d9'], ['7E', '7 Einstein (7E)', '#ff2d55'],
  ['7F', '7 Franklin (7F)', '#2563eb'], ['7Lang', '7 Lang', '#f5a623'],
  ['7N', '7 Newton (7N)', '#a855f7'], ['7P', '7 Pasteur (7P)', '#65a30d'],
  ['7T', '7 Tesla (7T)', '#ec4899'], ['8A', '8 Austen (8A)', '#f97316'],
  ['8B', '8 Byron (8B)', '#0891b2'], ['8H', '8 Hemingway (8H)', '#15803d'],
  ['8Lang', '8 Lang', '#e11d48'], ['8M', '8 Mendelssohn (8M)', '#22c55e'],
  ['8S', '8 Shakespeare (8S)', '#eab308'], ['8W', '8 Wordsworth (8W)', '#4f46e5'],
  ['9B', '9 Beethoven (9B)', '#f43f5e'], ['9G', '9 Gershwin (9G)', '#0ea5e9'],
  ['9H', '9 Haydn (9H)', '#7c3aed'], ['9M', '9 Mozart (9M)', '#fb7185'],
  ['9S', '9 Schubert (9S)', '#10b981'], ['9T', '9 Turing (9T)', '#d946ef'],
  ['10L', '10 Leonardo (10L)', '#d97706'], ['10M', '10 Monet (10M)', '#16a34a'],
  ['10P', '10 Picasso (10P)', '#ea580c'], ['10R', '10 Rutherford (10R)', '#0e7490'],
  ['10V', '10 Van Gogh (10V)', '#9333ea'], ['11A', '11 Aristotle (11A)', '#0284c7'],
  ['11P', '11 Plato (11P)', '#1d4ed8'], ['11R', '11 Ramanujan (11R)', '#ff9500'],
  ['11S', '11 Socrates (11S)', '#dc2626'], ['11V', '11 Voltaire (11V)', '#059669'],
  ['12G', '12 Gryphon (12G)', '#db2777'], ['12M', '12 Merlion (12M)', '#7e22ce'],
  ['12P', '12 Phoenix (12P)', '#c2410c'], ['12U', '12 Unicorn (12U)', '#6366f1'],
  ['Council', 'Student Council (สภานักเรียน)', '#ef4444'], ['SMT', 'SMT', '#ff007f'],
  ['PST', 'PST', '#f472b6'], ['Teacher', 'Teacher', '#991b1b'],
].map(([id, name, color], i) => ({ id, name, color, kind: 'class', sortOrder: i * 10 }));

DEFAULT_GROUPS.push({ id: 'VIP', name: 'VIP', color: '#c9a227', kind: 'vip', sortOrder: 1000 });

module.exports = { DEFAULT_GROUPS };
