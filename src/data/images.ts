// Photography: all free under the Unsplash License (https://unsplash.com/license).
// Credits are shown in the site footer.

const u = (id: string, w = 1200) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=80`;

export const photos = {
  elder: { src: (w?: number) => u("1758686253896-e6c76b6f7aa1", w), alt: "Smiling older woman in a pink cardigan at home", credit: "Vitaly Gariev", page: "https://unsplash.com/photos/48eXkHNmNrk" },
  elderPortrait: { src: (w?: number) => u("1749189516333-168cfd97de0b", w), alt: "Older woman smiling at the camera", credit: "litoon dev", page: "https://unsplash.com/photos/yp8R_PT0wHU" },
  couple: { src: (w?: number) => u("1758691031402-5cfbeebc6162", w), alt: "Older couple smiling together on a couch", credit: "Vitaly Gariev", page: "https://unsplash.com/photos/wiibVZwx0oQ" },
  coupleOutdoors: { src: (w?: number) => u("1658314755707-1fbdf7c40145", w), alt: "Older couple holding hands outdoors", credit: "Centre for Ageing Better", page: "https://unsplash.com/photos/lNTbuoYMSro" },
  caregiver: { src: (w?: number) => u("1765896387387-0538bc9f997e", w), alt: "Caregiver smiling with an older woman in her room", credit: "Age Cymru", page: "https://unsplash.com/photos/dMhB7w99ju8" },
  caregiverTalk: { src: (w?: number) => u("1765896387398-1e1ae8d2eb85", w), alt: "Caregiver in green scrubs talking with an older person", credit: "Age Cymru", page: "https://unsplash.com/photos/qW3DLnehg9w" },
  laughing: { src: (w?: number) => u("1765896387377-e293914d1e69", w), alt: "Older woman and caregiver laughing together", credit: "Age Cymru", page: "https://unsplash.com/photos/GPrh_GLiWCI" },
  walker: { src: (w?: number) => u("1773227055624-07b515ba87c5", w), alt: "Caregiver helping an older woman with a walker", credit: "Age Cymru", page: "https://unsplash.com/photos/2obyM4zYt3Y" },
  family: { src: (w?: number) => u("1741651366517-cf81c7de3868", w), alt: "Mother and daughter sharing a hug and smiling", credit: "Anita Monteiro", page: "https://unsplash.com/photos/_sJ4SS7lSOY" },
} as const;

export type PhotoKey = keyof typeof photos;
