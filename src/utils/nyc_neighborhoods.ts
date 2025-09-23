// ---------------- NYC neighborhoods (approximate polygons) ----------------
import { Business } from '@/types/business';

export interface NeighborhoodBounds {
  borough: string;
  name: string;
  boundary: any;
  center?: { lat: number; lon: number }; // optional
}

export const nycNeighborhoodBoundaries = {
  "Manhattan": {
    "Upper East Side": [
      { lat: 40.764, lon: -73.973 },
      { lat: 40.764, lon: -73.945 },
      { lat: 40.785, lon: -73.945 },
      { lat: 40.796, lon: -73.945 },
      { lat: 40.796, lon: -73.949 },
      { lat: 40.796, lon: -73.958 },
      { lat: 40.785, lon: -73.958 },
      { lat: 40.764, lon: -73.973 }
    ],
    "Upper West Side": [
      { lat: 40.764, lon: -73.973 },
      { lat: 40.764, lon: -73.989 },
      { lat: 40.770, lon: -73.991 },
      { lat: 40.780, lon: -73.993 },
      { lat: 40.790, lon: -73.995 },
      { lat: 40.800, lon: -73.997 },
      { lat: 40.800, lon: -73.958 },
      { lat: 40.796, lon: -73.958 },
      { lat: 40.790, lon: -73.958 },
      { lat: 40.785, lon: -73.958 },
      { lat: 40.780, lon: -73.965 },
      { lat: 40.770, lon: -73.970 },
      { lat: 40.764, lon: -73.973 }
    ],
    "Harlem": [
      { lat: 40.800, lon: -73.958 },
      { lat: 40.800, lon: -73.997 },
      { lat: 40.810, lon: -73.998 },
      { lat: 40.825, lon: -73.999 },
      { lat: 40.840, lon: -73.999 },
      { lat: 40.850, lon: -73.999 },
      { lat: 40.850, lon: -73.930 },
      { lat: 40.840, lon: -73.928 },
      { lat: 40.825, lon: -73.926 },
      { lat: 40.810, lon: -73.924 },
      { lat: 40.800, lon: -73.922 },
      { lat: 40.800, lon: -73.945 },
      { lat: 40.800, lon: -73.958 }
    ],
    "Midtown": [
      { lat: 40.748, lon: -73.985 },
      { lat: 40.748, lon: -73.999 },
      { lat: 40.764, lon: -73.999 },
      { lat: 40.764, lon: -73.973 },
      { lat: 40.764, lon: -73.945 },
      { lat: 40.748, lon: -73.945 },
      { lat: 40.748, lon: -73.985 }
    ],
    "Financial District": [
      { lat: 40.701, lon: -74.016 },
      { lat: 40.713, lon: -74.014 },
      { lat: 40.716, lon: -74.006 },
      { lat: 40.716, lon: -73.999 },
      { lat: 40.713, lon: -73.996 },
      { lat: 40.708, lon: -73.996 },
      { lat: 40.701, lon: -74.000 },
      { lat: 40.694, lon: -74.016 },
      { lat: 40.701, lon: -74.016 }
    ],
    "Lower East Side": [
      { lat: 40.722, lon: -73.989 },
      { lat: 40.722, lon: -73.971 },
      { lat: 40.722, lon: -73.945 },
      { lat: 40.708, lon: -73.945 },
      { lat: 40.701, lon: -73.950 },
      { lat: 40.701, lon: -73.975 },
      { lat: 40.708, lon: -73.984 },
      { lat: 40.715, lon: -73.987 },
      { lat: 40.722, lon: -73.989 }
    ]
  },
  "Brooklyn": {
    "Williamsburg": [
      { lat: 40.728, lon: -73.964 },
      { lat: 40.728, lon: -73.936 },
      { lat: 40.718, lon: -73.936 },
      { lat: 40.710, lon: -73.940 },
      { lat: 40.706, lon: -73.948 },
      { lat: 40.706, lon: -73.964 },
      { lat: 40.710, lon: -73.970 },
      { lat: 40.718, lon: -73.968 },
      { lat: 40.728, lon: -73.964 }
    ],
    "Bushwick": [
      { lat: 40.710, lon: -73.936 },
      { lat: 40.728, lon: -73.936 },
      { lat: 40.728, lon: -73.905 },
      { lat: 40.718, lon: -73.895 },
      { lat: 40.710, lon: -73.885 },
      { lat: 40.695, lon: -73.885 },
      { lat: 40.690, lon: -73.895 },
      { lat: 40.688, lon: -73.910 },
      { lat: 40.694, lon: -73.920 },
      { lat: 40.694, lon: -73.932 },
      { lat: 40.710, lon: -73.936 }
    ],
    "Downtown Brooklyn": [
      { lat: 40.701, lon: -73.996 },
      { lat: 40.701, lon: -73.975 },
      { lat: 40.694, lon: -73.975 },
      { lat: 40.688, lon: -73.985 },
      { lat: 40.685, lon: -73.992 },
      { lat: 40.690, lon: -73.996 },
      { lat: 40.701, lon: -73.996 }
    ],
    "Greenpoint": [
      { lat: 40.72472717355694, lon: -73.96255870141101 },
      { lat: 40.72032695756151, lon: -73.94432876886414 },
      { lat: 40.72749639111233, lon: -73.92954993713347 },
      { lat: 40.73524958724362, lon: -73.94221750718833 },
      { lat: 40.73964881659525, lon: -73.95508808317354 },
      { lat: 40.73478811276093, lon: -73.96255870141101 },
      { lat: 40.72472717355694, lon: -73.96255870141101 }
    ],
    "Bedford-Stuyvesant": [
      { lat: 40.679569196635924, lon: -73.95830712634846 },
      { lat: 40.676509842634786, lon: -73.90826783588624 },
      { lat: 40.679569196635924, lon: -73.90534959253166 },
      { lat: 40.70098074328471, lon: -73.94208512652452 },
      { lat: 40.697987445327776, lon: -73.96199784588514 },
      { lat: 40.679569196635924, lon: -73.95830712634846 }
    ],
    "Bed Stuy": [],
    "Crown Heights": [
      { lat: 40.66341263022619, lon: -73.96100835994925 },
      { lat: 40.664300057611925, lon: -73.94554524756434 },
      { lat: 40.663335462069426, lon: -73.93135377271106 },
      { lat: 40.668312625342956, lon: -73.92001076592872 },
      { lat: 40.67664564844729, lon: -73.919298648911 },
      { lat: 40.67857444054229, lon: -73.9525138212378 },
      { lat: 40.680966065237854, lon: -73.96451807953662 },
      { lat: 40.66341263022619, lon: -73.96100835994925 }
    ],
    "Park Slope": [
      { lat: 40.660, lon: -74.005 },
      { lat: 40.665, lon: -74.000 },
      { lat: 40.670, lon: -73.995 },
      { lat: 40.675, lon: -73.990 },
      { lat: 40.680, lon: -73.985 },
      { lat: 40.685, lon: -73.980 },
      { lat: 40.688, lon: -73.975 },
      { lat: 40.690, lon: -73.970 },
      { lat: 40.688, lon: -73.965 },
      { lat: 40.685, lon: -73.962 },
      { lat: 40.680, lon: -73.960 },
      { lat: 40.675, lon: -73.962 },
      { lat: 40.670, lon: -73.965 },
      { lat: 40.665, lon: -73.970 },
      { lat: 40.662, lon: -73.975 },
      { lat: 40.660, lon: -73.980 },
      { lat: 40.658, lon: -73.985 },
      { lat: 40.657, lon: -73.990 },
      { lat: 40.658, lon: -73.995 },
      { lat: 40.660, lon: -74.000 },
      { lat: 40.660, lon: -74.005 }
    ],
    "Brooklyn Heights": [
      { lat: 40.702, lon: -73.998 },
      { lat: 40.701, lon: -73.994 },
      { lat: 40.699, lon: -73.990 },
      { lat: 40.696, lon: -73.988 },
      { lat: 40.693, lon: -73.990 },
      { lat: 40.692, lon: -73.994 },
      { lat: 40.693, lon: -73.999 },
      { lat: 40.696, lon: -74.001 },
      { lat: 40.699, lon: -74.001 },
      { lat: 40.702, lon: -73.998 } // close loop
    ],
    "Coney Island": [
      { lat: 40.568548717276634, lon: -74.00263792474793 },
      { lat: 40.575198728608605, lon: -73.93036848637881 },
      { lat: 40.58236956877704, lon: -73.9317417773692 },
      { lat: 40.58432511905696, lon: -73.9615250257232 },
      { lat: 40.583021425222945, lon: -73.9834976815694 },
      { lat: 40.5829562398642, lon: -74.01585585053041 },
      { lat: 40.57363407951663, lon: -74.01362425267102 },
      { lat: 40.568548717276634, lon: -74.00263792474793 }
    ],
    "Brownsville": [
      { lat: 40.650239922867144, lon: -73.90815332307835 },
      { lat: 40.65704491136673, lon: -73.89943745599567 },
      { lat: 40.67585131594118, lon: -73.90383769957138 },
      { lat: 40.676749782722254, lon: -73.91915393201764 },
      { lat: 40.66904824598577, lon: -73.91991551263652 },
      { lat: 40.667957123010375, lon: -73.92220025449312 },
      { lat: 40.66821385943424, lon: -73.92524657696862 },
      { lat: 40.665710637140364, lon: -73.92558505724368 },
      { lat: 40.650239922867144, lon: -73.90815332307835 }
    ],
    "Bay Ridge": [
      { lat: 40.633664028356556, lon: -74.01443841143283 },
      { lat: 40.645148493266795, lon: -74.03181513526627 },
      { lat: 40.6210075616294, lon: -74.04309599227103 },
      { lat: 40.61845470626055, lon: -74.02102475030519 },
      { lat: 40.633664028356556, lon: -74.01443841143283 }
    ],
    "Canarsie": [
      { lat: 40.65427474460049, lon: -73.92131817559141 },
      { lat: 40.63220567743335, lon: -73.9187158391077 },
      { lat: 40.62233031137304, lon: -73.8955244286795 },
      { lat: 40.63569075209594, lon: -73.8769253767519 },
      { lat: 40.65762613031434, lon: -73.89634336450415 },
      { lat: 40.65427474460049, lon: -73.92131817559141 }
    ]
  },
  "Queens": {
    "Astoria": [
      { lat: 40.74900415868295, lon: -73.93717538947259 },
      { lat: 40.75334780471157, lon: -73.9134119917017 },
      { lat: 40.76734206720742, lon: -73.90200810912532 },
      { lat: 40.768982580881904, lon: -73.91079992921213 },
      { lat: 40.772842453300406, lon: -73.90583063959784 },
      { lat: 40.78273235307874, lon: -73.91984658466379 },
      { lat: 40.77757049161311, lon: -73.93819473093194 },
      { lat: 40.76791257219066, lon: -73.9403419178893 },
      { lat: 40.755007992083414, lon: -73.95091674705004 },
      { lat: 40.74900415868295, lon: -73.93717538947259 }
    ],
    "Long Island City": [
      { lat: 40.736996801344816, lon: -73.96586790602642 },
      { lat: 40.73790728562442, lon: -73.9476718004038 },
      { lat: 40.72899701093349, lon: -73.93127813920604 },
      { lat: 40.73381000823409, lon: -73.93685713385449 },
      { lat: 40.73647651901876, lon: -73.92750158898248 },
      { lat: 40.747466618196036, lon: -73.92535582181 },
      { lat: 40.746946417760455, lon: -73.92054930334363 },
      { lat: 40.74993751469468, lon: -73.92012014990914 },
      { lat: 40.75312353518046, lon: -73.92175093296022 },
      { lat: 40.763005729459515, lon: -73.94483938773612 },
      { lat: 40.736996801344816, lon: -73.96586790602642 }
    ],
    "Jackson Heights": [
      { lat: 40.746431153175784, lon: -73.89475458358933 },
      { lat: 40.74903213481435, lon: -73.86909120820647 },
      { lat: 40.76314068721813, lon: -73.87539976369355 },
      { lat: 40.76616355889972, lon: -73.89436834549828 },
      { lat: 40.75728957725572, lon: -73.90016191686398 },
      { lat: 40.746431153175784, lon: -73.89475458358933 }
    ],
    "Flushing": [
      { lat: 40.75081994151636, lon: -73.83653760937234 },
      { lat: 40.746138227191, lon: -73.81404996940475 },
      { lat: 40.75550132623001, lon: -73.82477880526716 },
      { lat: 40.75855705232799, lon: -73.8203156095484 },
      { lat: 40.764798098971355, lon: -73.82349134496366 },
      { lat: 40.77675846701696, lon: -73.82426382114576 },
      { lat: 40.77617349909164, lon: -73.8294136623597 },
      { lat: 40.76700832913096, lon: -73.83919836066623 },
      { lat: 40.75621650875757, lon: -73.83911252997932 },
      { lat: 40.75081994151636, lon: -73.83653760937234 }
    ],
    "Forest Hills": [
      { lat: 40.70443663561672, lon: -73.85372180154059 },
      { lat: 40.71582236213084, lon: -73.82591265898525 },
      { lat: 40.73995366355022, lon: -73.84556788628517 },
      { lat: 40.736181692157906, lon: -73.85664004489514 },
      { lat: 40.72759640828398, lon: -73.85312098673229 },
      { lat: 40.722002369806894, lon: -73.85724085970345 },
      { lat: 40.72148197023097, lon: -73.85938662687593 },
      { lat: 40.70443663561672, lon: -73.85372180154059 }
    ],
    "Jamaica": [
      { lat: 40.68891942822231, lon: -73.80908423727804 },
      { lat: 40.705434840075355, lon: -73.77587194151592 },
      { lat: 40.714172280437616, lon: -73.77870475497798 },
      { lat: 40.704175961812695, lon: -73.81728962799575 },
      { lat: 40.68891942822231, lon: -73.80908423727804 }
    ],
    "Rockaway Beach": [
      { lat: 40.58504160285142, lon: -73.80385805932222 },
      { lat: 40.59642180833501, lon: -73.80648276941626 },
      { lat: 40.582533839570345, lon: -73.84424472754358 },
      { lat: 40.575202915499744, lon: -73.83933397962568 },
      { lat: 40.58504160285142, lon: -73.80385805932222 }
    ],
    "Ozone Park": [
      { lat: 40.675259968298725, lon: -73.86227355899273 },
      { lat: 40.666614724994474, lon: -73.83302384616258 },
      { lat: 40.68532180272685, lon: -73.84213045778598 },
      { lat: 40.687288256561786, lon: -73.83531557623999 },
      { lat: 40.69131244631979, lon: -73.8374866889449 },
      { lat: 40.683080889252636, lon: -73.86709825389254 },
      { lat: 40.675259968298725, lon: -73.86227355899273 }
    ],
    "Ridgewood": [
      { lat: 40.69142200848006, lon: -73.9014218801489 },
      { lat: 40.71245189031098, lon: -73.88765472092086 },
      { lat: 40.71400939519963, lon: -73.92443563885847 },
      { lat: 40.70928485134668, lon: -73.92203837232623 },
      { lat: 40.70393688627365, lon: -73.91299725283318 },
      { lat: 40.69142200848006, lon: -73.9014218801489 }
    ],
    "Whitestone": [
      { lat: 40.77622606102522, lon: -73.82889106683439 },
      { lat: 40.7730411478115, lon: -73.79550292963059 },
      { lat: 40.77622606102522, lon: -73.7841732789599 },
      { lat: 40.79611206501394, lon: -73.7942154693271 },
      { lat: 40.80111512172954, lon: -73.82005050608376 },
      { lat: 40.79812632799821, lon: -73.82580116210602 },
      { lat: 40.77622606102522, lon: -73.82889106683439 }
    ]
  },
  "Bronx": {
    "Mott Haven": [
      { lat: 40.79910097643198, lon: -73.91889991420845 },
      { lat: 40.8114591015429, lon: -73.89965004369817 },
      { lat: 40.81976614199838, lon: -73.9324685908432 },
      { lat: 40.80686682374214, lon: -73.9324685908432 },
      { lat: 40.79910097643198, lon: -73.91889991420845 }
    ],
    "Riverdale": [
      { lat: 40.88649530127742, lon: -73.9216854304909 },
      { lat: 40.882872688840884, lon: -73.90767352817056 },
      { lat: 40.90202637615229, lon: -73.90498730855474 },
      { lat: 40.90422128701191, lon: -73.91471577959446 },
      { lat: 40.88649530127742, lon: -73.9216854304909 }
    ],
    "Belmont": [
      { lat: 40.846729343040934, lon: -73.88346585239005 },
      { lat: 40.85685728132303, lon: -73.88041886300513 },
      { lat: 40.86192066989816, lon: -73.89110478352409 },
      { lat: 40.85312440730037, lon: -73.89771374641532 },
      { lat: 40.846729343040934, lon: -73.88346585239005 }
    ],
    "Hunts Point": [
      { lat: 40.804763674979974, lon: -73.90237655710176 },
      { lat: 40.80030694082782, lon: -73.873000397996 },
      { lat: 40.80654628484731, lon: -73.86791844642073 },
      { lat: 40.81386386568252, lon: -73.87200879768862 },
      { lat: 40.824416647439165, lon: -73.88570527693413 },
      { lat: 40.80926701811739, lon: -73.90312025733229 },
      { lat: 40.804763674979974, lon: -73.90237655710176 }
    ]
  },
  "Staten Island": {
    "St. George": [
      { lat: 40.635677697421215, lon: -74.08374671146835 },
      { lat: 40.63794636227644, lon: -74.07194847990891 },
      { lat: 40.65074666901615, lon: -74.07184170858258 },
      { lat: 40.64734429538269, lon: -74.08972590574282 },
      { lat: 40.63827045096242, lon: -74.08785740753206 },
      { lat: 40.635677697421215, lon: -74.08374671146835 }
    ],
    "Stapleton": [
      { lat: 40.622728872140065, lon: -74.08531074010469 },
      { lat: 40.62621412509723, lon: -74.0719211529484 },
      { lat: 40.6324675809761, lon: -74.07325152859534 },
      { lat: 40.63305381244112, lon: -74.07951716873899 },
      { lat: 40.628526669204774, lon: -74.08376578774049 },
      { lat: 40.622728872140065, lon: -74.08531074010469 }
    ],
    "Tottenville": [
      { lat: 40.49518873885253, lon: -74.24841660071705 },
      { lat: 40.50220486752508, lon: -74.2222098406027 },
      { lat: 40.520714491176314, lon: -74.23058359827237 },
      { lat: 40.52142176396902, lon: -74.24430725667546 },
      { lat: 40.50815915735985, lon: -74.25787584549205 }
    ],
    "Great Kills": [
      { lat: 40.52920578083613, lon: -74.13663506037348 },
      { lat: 40.544861010278694, lon: -74.1226446584089 },
      { lat: 40.570227757704004, lon: -74.15148376920705 },
      { lat: 40.56116465079896, lon: -74.16332840399913 },
      { lat: 40.54792639769387, lon: -74.16049599133146 },
      { lat: 40.52920578083613, lon: -74.13663506037348 }
    ]
  }
};

// ---------------- Public helper ----------------
export function getNeighborhoodBoundary(borough: string, neighborhood: string) {
  if (neighborhood === "Bed Stuy") neighborhood = "Bedford-Stuyvesant";

  const boroughData = nycNeighborhoodBoundaries[borough];
  if (!boroughData) throw new Error(`Borough "${borough}" not found`);

  const boundary = boroughData[neighborhood];
  if (!boundary) throw new Error(`Neighborhood "${neighborhood}" not found in ${borough}`);
  return boundary;
}

// Convert boundaries to neighborhood data format expected by other components
export const nycNeighborhoods = Object.fromEntries(
  Object.entries(nycNeighborhoodBoundaries).map(([borough, neighborhoods]) => [
    borough,
    Object.entries(neighborhoods).map(([name, boundary]) => {
      // Calculate more accurate center point using centroid of polygon
      let centroidLat = 0;
      let centroidLon = 0;
      let signedArea = 0;
      
      for (let i = 0; i < boundary.length - 1; i++) {
        const x0 = boundary[i].lon;
        const y0 = boundary[i].lat;
        const x1 = boundary[i + 1].lon;
        const y1 = boundary[i + 1].lat;
        
        const a = x0 * y1 - x1 * y0;
        signedArea += a;
        centroidLat += (y0 + y1) * a;
        centroidLon += (x0 + x1) * a;
      }
      
      signedArea *= 0.5;
      centroidLat /= (6 * signedArea);
      centroidLon /= (6 * signedArea);
      
      // Fallback to geometric center if centroid calculation fails
      if (isNaN(centroidLat) || isNaN(centroidLon) || Math.abs(signedArea) < 1e-10) {
        const lats = boundary.map(p => p.lat);
        const lons = boundary.map(p => p.lon);
        centroidLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        centroidLon = (Math.min(...lons) + Math.max(...lons)) / 2;
      }
      
      return { name, lat: centroidLat, lon: centroidLon, boundary };
    })
  ])
);

// Generate boundary using neighborhood and neighbors
export function generateNeighborhoodBoundary(
  neighborhood: { name: string; lat: number; lon: number }, 
  neighbors: { name: string; lat: number; lon: number }[]
) {
  // Find the actual boundary from our data
  for (const [borough, neighborhoods] of Object.entries(nycNeighborhoodBoundaries)) {
    if (neighborhoods[neighborhood.name]) {
      return neighborhoods[neighborhood.name];
    }
  }
  
  console.log(`🏙️ Generating improved boundary for ${neighborhood.name}`);
  
  // Determine accurate radius based on neighborhood characteristics
  const getNeighborhoodRadius = (name: string): number => {
    const nameLower = name.toLowerCase();
    
    // Major areas and districts - larger boundaries
    if (['financial district', 'midtown', 'upper east side', 'upper west side', 'downtown'].some(area => nameLower.includes(area))) {
      return 0.012; // ~1.3km radius
    }
    
    // Well-known large neighborhoods
    if (['chinatown', 'little italy', 'soho', 'tribeca', 'chelsea', 'greenwich village', 'east village', 'west village'].some(area => nameLower.includes(area))) {
      return 0.008; // ~900m radius
    }
    
    // Medium neighborhoods
    if (['nolita', 'bowery', 'murray hill', 'gramercy', 'flatiron'].some(area => nameLower.includes(area))) {
      return 0.006; // ~650m radius
    }
    
    // Small but distinct areas
    if (['battery park', 'stone street', 'south street seaport'].some(area => nameLower.includes(area))) {
      return 0.004; // ~450m radius
    }
    
    // Default for other neighborhoods
    return 0.007; // ~750m radius
  };

  const baseRadius = getNeighborhoodRadius(neighborhood.name);
  
  // Create 16-20 points for very realistic boundaries
  const numPoints = 16 + Math.floor(Math.random() * 5); // 16-20 points
  const boundary: { lat: number; lon: number }[] = [];
  
  // Sort neighbors by distance and use them to influence boundary shape
  const influentialNeighbors = neighbors
    .map(n => ({
      ...n,
      distance: haversine(neighborhood.lat, neighborhood.lon, n.lat, n.lon),
      angle: Math.atan2(n.lat - neighborhood.lat, n.lon - neighborhood.lon)
    }))
    .filter(n => n.distance < baseRadius * 3) // Only use nearby neighbors
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 6); // Use closest 6 neighbors for influence
  
  for (let i = 0; i < numPoints; i++) {
    const baseAngle = (2 * Math.PI * i) / numPoints;
    
    // Start with base radius
    let currentRadius = baseRadius;
    
    // Apply neighbor influence for more realistic boundaries
    if (influentialNeighbors.length > 0) {
      for (const neighbor of influentialNeighbors) {
        const angleDiff = Math.abs(baseAngle - neighbor.angle);
        const normalizedAngleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
        
        // Strong influence when pointing directly toward neighbor
        if (normalizedAngleDiff < Math.PI / 4) { // Within 45 degrees
          const influence = 1 - (normalizedAngleDiff / (Math.PI / 4));
          const distanceFactor = Math.max(0.3, 1 - (neighbor.distance / (baseRadius * 2)));
          currentRadius *= (0.5 + (1 - influence * distanceFactor) * 0.5); // Reduce radius toward neighbors
        }
      }
    }
    
    // Add natural variation and irregularity
    const radiusVariation = 0.75 + Math.random() * 0.5; // 75%-125% variation
    currentRadius *= radiusVariation;
    
    // Add small angular offset for organic shape
    const angleOffset = (Math.random() - 0.5) * 0.3; // ±0.15 radians (~±9°)
    const finalAngle = baseAngle + angleOffset;
    
    const lat = neighborhood.lat + currentRadius * Math.cos(finalAngle);
    const lon = neighborhood.lon + currentRadius * Math.sin(finalAngle) / Math.cos(neighborhood.lat * Math.PI / 180);
    
    boundary.push({ lat, lon });
  }
  
  // Close the polygon
  if (boundary.length > 0) {
    boundary.push({ ...boundary[0] });
  }
  
  console.log(`✅ Generated ${boundary.length} accurate boundary points for ${neighborhood.name}`);
  return boundary;
}

// Haversine distance calculation (in km)
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Find neighborhood by name (case insensitive)
export function findNeighborhoodBoundaryByName(name: string) {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  for (const borough of Object.keys(nycNeighborhoodBoundaries)) {
    for (const n of Object.keys(nycNeighborhoodBoundaries[borough])) {
      if (n.toLowerCase() === normalized) {
        return {
          borough,
          name: n,
          boundary: nycNeighborhoodBoundaries[borough][n]
        };
      }
    }
  }
  return null;
}

// Ray-casting algorithm to check if a point is inside a polygon
export const isPointInPolygon = (point: { lat: number; lon: number }, polygon: { lat: number; lon: number }[]) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon, yi = polygon[i].lat;
    const xj = polygon[j].lon, yj = polygon[j].lat;
    const intersect = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < (xj - xi) * (point.lat - yi) / (yj - yi + 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Merge new businesses with existing, deduplicate by ID
const mergeWithExisting = (existing: Business[], incoming: Business[]) => {
  const map = new Map(existing.map(b => [b.id, b]));
  for (const b of incoming) {
    if (!map.has(b.id)) map.set(b.id, b);
  }
  return Array.from(map.values());
};

// Filter businesses within neighborhood rectangular bounds with generous padding
export function filterBusinessesByNeighborhood(
  businesses: Business[], 
  neighborhoodBounds: NeighborhoodBounds
): Business[] {
  const polygon = neighborhoodBounds.boundary;
  
  console.log('🏙️ Filtering businesses using polygon for neighborhood:', neighborhoodBounds.name);
  console.log('🏙️ Polygon points:', polygon.length);
  console.log('🏙️ Total businesses to check:', businesses.length);

  const filtered = businesses.filter(b => {
    if (!b.position?.lat || !b.position?.lng) return false;
    return isPointInPolygon({ lat: b.position.lat, lon: b.position.lng }, polygon);
  });

  console.log('🏙️ Businesses inside polygon:', filtered.length);
  return filtered;
}

// Get all neighborhood names for autocomplete/matching
export function getAllNeighborhoodNames(): string[] {
  const names: string[] = [];
  
  for (const neighborhoods of Object.values(nycNeighborhoods)) {
    for (const neighborhood of neighborhoods) {
      names.push(neighborhood.name);
    }
  }
  
  return names.sort();
}
