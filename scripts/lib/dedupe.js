// ---------------------------------------------------------------------------
// Intra-batch dedupe keys (pure, no deps)
// ---------------------------------------------------------------------------
//
// markIntraBatchDupes(leads) -> { kept, dropped }
// Drops later rows that repeat an earlier row's google_place_id, website key
// (lowercase host without www.), valid-phone E.164, or lowercase
// company_name + stored phone. Mirrors the key order used by the DB checks:
// place id, website, phone, name+phone.

import { websiteKey } from "./website.js";

function namePhoneKey(lead) {
  if (!lead.company_name || !lead.phone) return null;
  return `${String(lead.company_name).toLowerCase()}|${String(lead.phone)}`;
}

export function markIntraBatchDupes(leads) {
  const seenPlaceIds = new Set();
  const seenWebsites = new Set();
  const seenPhones = new Set();
  const seenNamePhone = new Set();
  const kept = [];
  let dropped = 0;

  for (const lead of leads) {
    let isDup = false;

    if (!isDup && lead.google_place_id) {
      if (seenPlaceIds.has(lead.google_place_id)) isDup = true;
      else seenPlaceIds.add(lead.google_place_id);
    }

    let key = null;
    if (!isDup && lead.website) {
      key = websiteKey(lead.website);
      if (key) {
        if (seenWebsites.has(key)) isDup = true;
        else seenWebsites.add(key);
      }
    }

    if (!isDup && lead.phoneValid && lead.phone) {
      if (seenPhones.has(lead.phone)) isDup = true;
      else seenPhones.add(lead.phone);
    }

    if (!isDup) {
      const npKey = namePhoneKey(lead);
      if (npKey) {
        if (seenNamePhone.has(npKey)) isDup = true;
        else seenNamePhone.add(npKey);
      }
    }

    if (isDup) dropped++;
    else kept.push(lead);
  }

  return { kept, dropped };
}
