// Generate realistic sample train data
export function generateTrainData(count: number = 10000) {
  const trainTypes = [
    { name: 'Sprinter', weight: 0.44 },
    { name: 'Stoptrein', weight: 0.24 },
    { name: 'Intercity', weight: 0.22 },
    { name: 'Sneltrain', weight: 0.03 },
    { name: 'Stopbus i.p.v. trein', weight: 0.02 },
    { name: 'Intercity direct', weight: 0.01 },
    { name: 'Snelbus i.p.v. trein', weight: 0.01 },
    { name: 'Thalys', weight: 0.003 },
    { name: 'ICE International', weight: 0.002 },
    { name: 'Nightjet', weight: 0.015 }
  ];

  const stations = [
    { code: 'RTD', name: 'Rotterdam Centraal' },
    { code: 'DT', name: 'Delft' },
    { code: 'GV', name: 'Den Haag HS' },
    { code: 'LEDN', name: 'Leiden Centraal' },
    { code: 'SHL', name: 'Schiphol Airport' },
    { code: 'ASD', name: 'Amsterdam Centraal' },
    { code: 'UT', name: 'Utrecht Centraal' },
    { code: 'NURNB', name: 'Nürnberg Hbf' },
    { code: 'FFS', name: 'Frankfurt (Main) Süd' },
    { code: 'FFMF', name: 'Frankfurt (M) Hbf' },
    { code: 'FNAF', name: 'Frankfurt Flughafen Fernb' },
    { code: 'FMZ', name: 'Mainz Hbf' },
    { code: 'KKO', name: 'Koblenz Hbf' },
    { code: 'BONN', name: 'Bonn Hbf' },
    { code: 'KKW', name: 'Köln West' }
  ];

  const data = [];
  const startDate = new Date('2023-05-15');
  const endDate = new Date('2023-05-22');

  function getWeightedRandom<T>(items: { name: T; weight: number }[]): T {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * total;
    
    for (const item of items) {
      random -= item.weight;
      if (random <= 0) return item.name;
    }
    return items[0].name;
  }

  function randomDate(start: Date, end: Date) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  }

  for (let i = 0; i < count; i++) {
    const serviceId = 11196117 + Math.floor(Math.random() * 2000);
    const date = randomDate(startDate, endDate);
    const type = getWeightedRandom(trainTypes);
    const trainNumber = type === 'Nightjet' ? 420 : (type === 'Intercity' || type === 'Intercity direct') ? 1410 : Math.floor(Math.random() * 10000);
    const station = stations[Math.floor(Math.random() * stations.length)];
    
    // Only 11% of records have departure/arrival times
    const hasTimes = Math.random() < 0.11;
    const departureTime = hasTimes ? new Date(date.getTime() + Math.random() * 24 * 60 * 60 * 1000).toISOString() : null;
    const arrivalTime = hasTimes ? new Date(date.getTime() + Math.random() * 24 * 60 * 60 * 1000).toISOString() : null;

    data.push({
      service_id: serviceId,
      date: date.toISOString().split('T')[0],
      type,
      train_number: trainNumber,
      station_code: station.code,
      station_name: station.name,
      departure_time: departureTime,
      arrival_time: arrivalTime
    });
  }

  return data;
}

export const initialQuery = `/**
 * Exploring Column Diagnostics
 * 
 * When running a query, your results will appear below the editor
 * and column diagnostics will appear on the right panel, providing an
 * overview of your data without requiring additional queries.
 * 
 * Run this query, then click on column names in the right panel to view detailed statistics.
 */

FROM trains;`;
