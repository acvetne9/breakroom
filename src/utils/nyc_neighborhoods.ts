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
      { lat: 40.768, lon: -73.981 },
      { lat: 40.768, lon: -73.949 },
      { lat: 40.800, lon: -73.949 },
      { lat: 40.800, lon: -73.981 },
      { lat: 40.768, lon: -73.981 }
    ],
    "Upper West Side": [
      { lat: 40.768, lon: -73.982 },
      { lat: 40.775, lon: -73.982 },
      { lat: 40.785, lon: -73.980 },
      { lat: 40.795, lon: -73.978 },
      { lat: 40.800, lon: -73.976 },
      { lat: 40.800, lon: -74.025 },
      { lat: 40.795, lon: -74.027 },
      { lat: 40.785, lon: -74.030 },
      { lat: 40.775, lon: -74.032 },
      { lat: 40.768, lon: -74.034 },
      { lat: 40.768, lon: -73.982 }
    ],
    "Harlem": [
      { lat: 40.800, lon: -73.976 },
      { lat: 40.805, lon: -73.974 },
      { lat: 40.815, lon: -73.972 },
      { lat: 40.825, lon: -73.970 },
      { lat: 40.835, lon: -73.968 },
      { lat: 40.845, lon: -73.966 },
      { lat: 40.850, lon: -73.964 },
      { lat: 40.850, lon: -73.930 },
      { lat: 40.845, lon: -73.928 },
      { lat: 40.835, lon: -73.926 },
      { lat: 40.825, lon: -73.924 },
      { lat: 40.815, lon: -73.922 },
      { lat: 40.805, lon: -73.920 },
      { lat: 40.800, lon: -73.918 },
      { lat: 40.800, lon: -73.949 },
      { lat: 40.800, lon: -73.976 }
    ],
    "Midtown": [
      { lat: 40.748, lon: -73.985 },
      { lat: 40.750, lon: -74.020 },
      { lat: 40.755, lon: -74.025 },
      { lat: 40.760, lon: -74.030 },
      { lat: 40.765, lon: -74.032 },
      { lat: 40.768, lon: -74.034 },
      { lat: 40.768, lon: -73.982 },
      { lat: 40.768, lon: -73.949 },
      { lat: 40.765, lon: -73.947 },
      { lat: 40.760, lon: -73.945 },
      { lat: 40.755, lon: -73.943 },
      { lat: 40.750, lon: -73.942 },
      { lat: 40.748, lon: -73.940 },
      { lat: 40.748, lon: -73.985 }
    ],
    "Greenwich Village": [
      { lat: 40.740, lon: -74.002 },
      { lat: 40.738, lon: -73.996 },
      { lat: 40.735, lon: -73.991 },
      { lat: 40.731, lon: -73.991 },
      { lat: 40.728, lon: -73.995 },
      { lat: 40.727, lon: -74.000 },
      { lat: 40.729, lon: -74.005 },
      { lat: 40.733, lon: -74.007 },
      { lat: 40.738, lon: -74.006 },
      { lat: 40.740, lon: -74.002 } // close loop
    ],
    "Financial District": [
      { lat: 40.711, lon: -74.013 },
      { lat: 40.709, lon: -74.010 },
      { lat: 40.708, lon: -74.006 },
      { lat: 40.706, lon: -74.004 },
      { lat: 40.704, lon: -74.004 },
      { lat: 40.702, lon: -74.007 },
      { lat: 40.702, lon: -74.010 },
      { lat: 40.704, lon: -74.013 },
      { lat: 40.707, lon: -74.015 },
      { lat: 40.711, lon: -74.013 } // close loop
    ]
  },
  "Brooklyn": {
    "Williamsburg": [
      { lat: 40.705, lon: -73.970 },
      { lat: 40.708, lon: -73.965 },
      { lat: 40.712, lon: -73.960 },
      { lat: 40.716, lon: -73.955 },
      { lat: 40.720, lon: -73.950 },
      { lat: 40.725, lon: -73.948 },
      { lat: 40.730, lon: -73.950 },
      { lat: 40.735, lon: -73.952 },
      { lat: 40.738, lon: -73.955 },
      { lat: 40.740, lon: -73.960 },
      { lat: 40.738, lon: -73.965 },
      { lat: 40.735, lon: -73.968 },
      { lat: 40.730, lon: -73.970 },
      { lat: 40.725, lon: -73.972 },
      { lat: 40.720, lon: -73.970 },
      { lat: 40.716, lon: -73.968 },
      { lat: 40.712, lon: -73.970 },
      { lat: 40.708, lon: -73.972 },
      { lat: 40.705, lon: -73.970 }
    ],
    "Bushwick": [
      { lat: 40.698, lon: -73.926 },
      { lat: 40.700, lon: -73.920 },
      { lat: 40.703, lon: -73.918 },
      { lat: 40.707, lon: -73.921 },
      { lat: 40.707, lon: -73.926 },
      { lat: 40.703, lon: -73.929 },
      { lat: 40.700, lon: -73.928 },
      { lat: 40.698, lon: -73.926 }
    ],
    "Greenpoint": [
      { lat: 40.720, lon: -73.975 },
      { lat: 40.725, lon: -73.970 },
      { lat: 40.730, lon: -73.965 },
      { lat: 40.735, lon: -73.960 },
      { lat: 40.740, lon: -73.955 },
      { lat: 40.745, lon: -73.950 },
      { lat: 40.748, lon: -73.945 },
      { lat: 40.750, lon: -73.940 },
      { lat: 40.748, lon: -73.935 },
      { lat: 40.745, lon: -73.932 },
      { lat: 40.740, lon: -73.930 },
      { lat: 40.735, lon: -73.932 },
      { lat: 40.730, lon: -73.935 },
      { lat: 40.725, lon: -73.940 },
      { lat: 40.722, lon: -73.945 },
      { lat: 40.720, lon: -73.950 },
      { lat: 40.718, lon: -73.955 },
      { lat: 40.717, lon: -73.960 },
      { lat: 40.718, lon: -73.965 },
      { lat: 40.720, lon: -73.970 },
      { lat: 40.720, lon: -73.975 }
    ],
    "Bedford–Stuyvesant": [
      { lat: 40.700, lon: -73.960 },
      { lat: 40.698, lon: -73.950 },
      { lat: 40.693, lon: -73.942 },
      { lat: 40.688, lon: -73.937 },
      { lat: 40.683, lon: -73.939 },
      { lat: 40.680, lon: -73.945 },
      { lat: 40.681, lon: -73.954 },
      { lat: 40.686, lon: -73.959 },
      { lat: 40.693, lon: -73.962 },
      { lat: 40.700, lon: -73.960 } // close loop
    ],
    "Crown Heights": [
      { lat: 40.676, lon: -73.960 },
      { lat: 40.674, lon: -73.951 },
      { lat: 40.672, lon: -73.942 },
      { lat: 40.669, lon: -73.935 },
      { lat: 40.664, lon: -73.935 },
      { lat: 40.660, lon: -73.940 },
      { lat: 40.659, lon: -73.948 },
      { lat: 40.662, lon: -73.956 },
      { lat: 40.667, lon: -73.961 },
      { lat: 40.672, lon: -73.962 },
      { lat: 40.676, lon: -73.960 } // close loop
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
      { lat: 40.583, lon: -73.990 },
      { lat: 40.582, lon: -73.982 },
      { lat: 40.580, lon: -73.974 },
      { lat: 40.576, lon: -73.968 },
      { lat: 40.573, lon: -73.967 },
      { lat: 40.570, lon: -73.972 },
      { lat: 40.568, lon: -73.979 },
      { lat: 40.569, lon: -73.986 },
      { lat: 40.573, lon: -73.991 },
      { lat: 40.578, lon: -73.993 },
      { lat: 40.583, lon: -73.990 } // close loop
    ],
    "Brownsville": [
      { lat: 40.669, lon: -73.920 },
      { lat: 40.668, lon: -73.912 },
      { lat: 40.665, lon: -73.907 },
      { lat: 40.660, lon: -73.905 },
      { lat: 40.656, lon: -73.908 },
      { lat: 40.655, lon: -73.914 },
      { lat: 40.656, lon: -73.920 },
      { lat: 40.660, lon: -73.925 },
      { lat: 40.665, lon: -73.925 },
      { lat: 40.669, lon: -73.920 } // close loop
    ],
    "Bensonhurst": [
      { lat: 40.619, lon: -74.005 },
      { lat: 40.618, lon: -73.999 },
      { lat: 40.616, lon: -73.993 },
      { lat: 40.612, lon: -73.989 },
      { lat: 40.608, lon: -73.990 },
      { lat: 40.605, lon: -73.994 },
      { lat: 40.604, lon: -74.000 },
      { lat: 40.606, lon: -74.006 },
      { lat: 40.610, lon: -74.008 },
      { lat: 40.615, lon: -74.008 },
      { lat: 40.619, lon: -74.005 } // close loop
    ],
    "Canarsie": [
      { lat: 40.647, lon: -73.907 },
      { lat: 40.646, lon: -73.899 },
      { lat: 40.643, lon: -73.892 },
      { lat: 40.638, lon: -73.889 },
      { lat: 40.633, lon: -73.891 },
      { lat: 40.629, lon: -73.895 },
      { lat: 40.628, lon: -73.901 },
      { lat: 40.630, lon: -73.908 },
      { lat: 40.635, lon: -73.911 },
      { lat: 40.641, lon: -73.911 },
      { lat: 40.647, lon: -73.907 } // close loop
    ]
  },
  "Queens": {
    "Astoria": [
      { lat: 40.776, lon: -73.930 },
      { lat: 40.774, lon: -73.922 },
      { lat: 40.770, lon: -73.916 },
      { lat: 40.765, lon: -73.913 },
      { lat: 40.760, lon: -73.914 },
      { lat: 40.756, lon: -73.918 },
      { lat: 40.755, lon: -73.925 },
      { lat: 40.758, lon: -73.931 },
      { lat: 40.764, lon: -73.934 },
      { lat: 40.771, lon: -73.934 },
      { lat: 40.776, lon: -73.930 } // close loop
    ],
    "Long Island City": [
      { lat: 40.752, lon: -73.959 },
      { lat: 40.751, lon: -73.951 },
      { lat: 40.748, lon: -73.943 },
      { lat: 40.743, lon: -73.938 },
      { lat: 40.739, lon: -73.940 },
      { lat: 40.737, lon: -73.946 },
      { lat: 40.738, lon: -73.953 },
      { lat: 40.742, lon: -73.958 },
      { lat: 40.747, lon: -73.961 },
      { lat: 40.752, lon: -73.959 } // close loop
    ],
    "Jackson Heights": [
      { lat: 40.761, lon: -73.897 },
      { lat: 40.760, lon: -73.889 },
      { lat: 40.757, lon: -73.883 },
      { lat: 40.753, lon: -73.879 },
      { lat: 40.749, lon: -73.881 },
      { lat: 40.747, lon: -73.886 },
      { lat: 40.748, lon: -73.892 },
      { lat: 40.751, lon: -73.897 },
      { lat: 40.755, lon: -73.900 },
      { lat: 40.761, lon: -73.897 } // close loop
    ],
    "Flushing": [
      { lat: 40.772, lon: -73.843 },
      { lat: 40.770, lon: -73.835 },
      { lat: 40.768, lon: -73.827 },
      { lat: 40.763, lon: -73.824 },
      { lat: 40.759, lon: -73.828 },
      { lat: 40.757, lon: -73.835 },
      { lat: 40.758, lon: -73.842 },
      { lat: 40.761, lon: -73.847 },
      { lat: 40.767, lon: -73.848 },
      { lat: 40.772, lon: -73.843 } // close loop
    ],
    "Forest Hills": [
      { lat: 40.725, lon: -73.853 },
      { lat: 40.724, lon: -73.846 },
      { lat: 40.722, lon: -73.839 },
      { lat: 40.718, lon: -73.835 },
      { lat: 40.714, lon: -73.837 },
      { lat: 40.712, lon: -73.843 },
      { lat: 40.713, lon: -73.849 },
      { lat: 40.716, lon: -73.853 },
      { lat: 40.721, lon: -73.855 },
      { lat: 40.725, lon: -73.853 } // close loop
    ],
    "Jamaica": [
      { lat: 40.709, lon: -73.798 },
      { lat: 40.708, lon: -73.791 },
      { lat: 40.705, lon: -73.785 },
      { lat: 40.700, lon: -73.782 },
      { lat: 40.696, lon: -73.785 },
      { lat: 40.694, lon: -73.791 },
      { lat: 40.694, lon: -73.798 },
      { lat: 40.697, lon: -73.803 },
      { lat: 40.702, lon: -73.805 },
      { lat: 40.707, lon: -73.803 },
      { lat: 40.709, lon: -73.798 } // close loop
    ],
    "Rockaway Beach": [
      { lat: 40.590, lon: -73.832 },
      { lat: 40.589, lon: -73.826 },
      { lat: 40.587, lon: -73.821 },
      { lat: 40.584, lon: -73.818 },
      { lat: 40.581, lon: -73.819 },
      { lat: 40.579, lon: -73.823 },
      { lat: 40.579, lon: -73.829 },
      { lat: 40.582, lon: -73.833 },
      { lat: 40.586, lon: -73.835 },
      { lat: 40.590, lon: -73.832 } // close loop
    ],
    "Ozone Park": [
      { lat: 40.684, lon: -73.860 },
      { lat: 40.682, lon: -73.853 },
      { lat: 40.680, lon: -73.847 },
      { lat: 40.676, lon: -73.844 },
      { lat: 40.672, lon: -73.846 },
      { lat: 40.670, lon: -73.852 },
      { lat: 40.671, lon: -73.858 },
      { lat: 40.674, lon: -73.862 },
      { lat: 40.679, lon: -73.863 },
      { lat: 40.684, lon: -73.860 } // close loop
    ],
    "Ridgewood": [
      { lat: 40.717, lon: -73.905 },
      { lat: 40.716, lon: -73.897 },
      { lat: 40.713, lon: -73.891 },
      { lat: 40.709, lon: -73.888 },
      { lat: 40.705, lon: -73.890 },
      { lat: 40.703, lon: -73.896 },
      { lat: 40.703, lon: -73.902 },
      { lat: 40.706, lon: -73.907 },
      { lat: 40.711, lon: -73.908 },
      { lat: 40.717, lon: -73.905 } // close loop
    ],
    "Whitestone": [
      { lat: 40.797, lon: -73.820 },
      { lat: 40.796, lon: -73.812 },
      { lat: 40.793, lon: -73.805 },
      { lat: 40.789, lon: -73.802 },
      { lat: 40.785, lon: -73.804 },
      { lat: 40.782, lon: -73.809 },
      { lat: 40.783, lon: -73.815 },
      { lat: 40.787, lon: -73.820 },
      { lat: 40.792, lon: -73.822 },
      { lat: 40.797, lon: -73.820 } // close loop
    ]
  },
  "Bronx": {
    "Mott Haven": [
      { lat: 40.816, lon: -73.929 },
      { lat: 40.815, lon: -73.923 },
      { lat: 40.814, lon: -73.918 },
      { lat: 40.811, lon: -73.916 },
      { lat: 40.808, lon: -73.916 },
      { lat: 40.805, lon: -73.919 },
      { lat: 40.804, lon: -73.924 },
      { lat: 40.806, lon: -73.928 },
      { lat: 40.810, lon: -73.930 },
      { lat: 40.816, lon: -73.929 } // close loop
    ],
    "Fordham": [
      { lat: 40.868, lon: -73.898 },
      { lat: 40.867, lon: -73.891 },
      { lat: 40.865, lon: -73.885 },
      { lat: 40.862, lon: -73.882 },
      { lat: 40.858, lon: -73.883 },
      { lat: 40.855, lon: -73.888 },
      { lat: 40.855, lon: -73.894 },
      { lat: 40.857, lon: -73.899 },
      { lat: 40.861, lon: -73.901 },
      { lat: 40.865, lon: -73.901 },
      { lat: 40.868, lon: -73.898 } // close loop
    ],
    "Riverdale": [
      { lat: 40.906, lon: -73.921 },
      { lat: 40.905, lon: -73.913 },
      { lat: 40.902, lon: -73.907 },
      { lat: 40.898, lon: -73.902 },
      { lat: 40.894, lon: -73.902 },
      { lat: 40.891, lon: -73.907 },
      { lat: 40.890, lon: -73.914 },
      { lat: 40.892, lon: -73.920 },
      { lat: 40.896, lon: -73.924 },
      { lat: 40.901, lon: -73.925 },
      { lat: 40.906, lon: -73.921 } // close loop
    ],
    "Belmont": [
      { lat: 40.860, lon: -73.891 },
      { lat: 40.859, lon: -73.886 },
      { lat: 40.857, lon: -73.882 },
      { lat: 40.854, lon: -73.881 },
      { lat: 40.851, lon: -73.883 },
      { lat: 40.850, lon: -73.887 },
      { lat: 40.851, lon: -73.891 },
      { lat: 40.854, lon: -73.894 },
      { lat: 40.858, lon: -73.894 },
      { lat: 40.860, lon: -73.891 } // close loop
    ],
    "Hunts Point": [
      { lat: 40.817, lon: -73.884 },
      { lat: 40.816, lon: -73.878 },
      { lat: 40.814, lon: -73.872 },
      { lat: 40.810, lon: -73.869 },
      { lat: 40.807, lon: -73.871 },
      { lat: 40.805, lon: -73.876 },
      { lat: 40.805, lon: -73.882 },
      { lat: 40.807, lon: -73.886 },
      { lat: 40.811, lon: -73.888 },
      { lat: 40.815, lon: -73.888 },
      { lat: 40.817, lon: -73.884 } // close loop
    ]
  },
  "Staten Island": {
    "St. George": [
      { lat: 40.651, lon: -74.084 },
      { lat: 40.649, lon: -74.078 },
      { lat: 40.646, lon: -74.072 },
      { lat: 40.643, lon: -74.067 },
      { lat: 40.640, lon: -74.068 },
      { lat: 40.638, lon: -74.073 },
      { lat: 40.639, lon: -74.079 },
      { lat: 40.643, lon: -74.083 },
      { lat: 40.651, lon: -74.084 } // close loop
    ],
    "Stapleton": [
      { lat: 40.634, lon: -74.090 },
      { lat: 40.632, lon: -74.084 },
      { lat: 40.629, lon: -74.078 },
      { lat: 40.627, lon: -74.072 },
      { lat: 40.624, lon: -74.068 },
      { lat: 40.621, lon: -74.066 },
      { lat: 40.622, lon: -74.072 },
      { lat: 40.627, lon: -74.079 },
      { lat: 40.632, lon: -74.086 },
      { lat: 40.634, lon: -74.090 } // close loop
    ],
    "Tottenville": [
      { lat: 40.517, lon: -74.264 },
      { lat: 40.514, lon: -74.258 },
      { lat: 40.511, lon: -74.251 },
      { lat: 40.509, lon: -74.245 },
      { lat: 40.505, lon: -74.240 },
      { lat: 40.501, lon: -74.238 },
      { lat: 40.502, lon: -74.244 },
      { lat: 40.506, lon: -74.256 },
      { lat: 40.512, lon: -74.261 },
      { lat: 40.517, lon: -74.264 } // close loop
    ],
    "Great Kills": [
      { lat: 40.561, lon: -74.166 },
      { lat: 40.558, lon: -74.160 },
      { lat: 40.554, lon: -74.152 },
      { lat: 40.551, lon: -74.145 },
      { lat: 40.547, lon: -74.145 },
      { lat: 40.546, lon: -74.151 },
      { lat: 40.548, lon: -74.158 },
      { lat: 40.553, lon: -74.164 },
      { lat: 40.558, lon: -74.167 },
      { lat: 40.561, lon: -74.166 } // close loop
    ],
    "New Dorp": [
      { lat: 40.580, lon: -74.128 },
      { lat: 40.577, lon: -74.123 },
      { lat: 40.574, lon: -74.118 },
      { lat: 40.571, lon: -74.115 },
      { lat: 40.568, lon: -74.114 },
      { lat: 40.567, lon: -74.118 },
      { lat: 40.568, lon: -74.122 },
      { lat: 40.572, lon: -74.125 },
      { lat: 40.576, lon: -74.127 },
      { lat: 40.580, lon: -74.128 } // close loop
    ]
  }
};

// ---------------- Public helper ----------------
export function getNeighborhoodBoundary(borough: string, neighborhood: string) {
  const boroughData = nycNeighborhoodBoundaries[borough];
  if (!boroughData) throw new Error(`Borough "${borough}" not found`);
  const boundary = boroughData[neighborhood];
  if (!boundary) throw new Error(`Neighborhood "${neighborhood}" not found in ${borough}`)
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
