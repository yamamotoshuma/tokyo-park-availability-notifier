import type { AvailabilitySlot, SkytreeLeagueMatchListing } from "./types.js";

function groupByDate(slots: AvailabilitySlot[]): Map<string, AvailabilitySlot[]> {
  const grouped = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const current = grouped.get(slot.date) ?? [];
    current.push(slot);
    grouped.set(slot.date, current);
  }

  return grouped;
}

export function buildAvailabilityMessage(slots: AvailabilitySlot[]): string {
  const grouped = groupByDate(slots);
  const lines = ["【都立公園 空き検知】浮間公園に空きがあります"];

  for (const [date, dateSlots] of grouped) {
    const first = dateSlots[0];
    lines.push("");
    lines.push(`${date}(${first?.weekday ?? ""}) ${first?.parkName ?? "浮間公園"} ${first?.facilityName ?? ""}`);
    for (const slot of dateSlots.sort((left, right) => left.startTime.localeCompare(right.startTime))) {
      const count = slot.availableCount === null ? "" : ` / 空き ${slot.availableCount}`;
      lines.push(`- ${slot.startTime}-${slot.endTime}${count}`);
    }
  }

  lines.push("");
  lines.push("予約する場合は都立公園スポーツレクリエーション予約システムから手動で確認してください。");
  return lines.join("\n");
}

function groupListingsByDate(listings: SkytreeLeagueMatchListing[]): Map<string, SkytreeLeagueMatchListing[]> {
  const grouped = new Map<string, SkytreeLeagueMatchListing[]>();
  for (const listing of listings) {
    const current = grouped.get(listing.date) ?? [];
    current.push(listing);
    grouped.set(listing.date, current);
  }

  return grouped;
}

export function buildSkytreeLeagueMessage(listings: SkytreeLeagueMatchListing[]): string {
  const grouped = groupListingsByDate(listings);
  const lines = ["【スカイツリーグ 試合募集】対象日に募集があります"];

  for (const [date, dateListings] of grouped) {
    const first = dateListings[0];
    lines.push("");
    lines.push(`${date}(${first?.weekday ?? ""})`);
    for (const listing of dateListings.sort((left, right) => left.startTime.localeCompare(right.startTime))) {
      const area = listing.area ? `${listing.area} ` : "";
      const ground = listing.groundName || "グラウンド未定";
      const className = listing.className ? ` / ${listing.className}` : "";
      const deadline = listing.deadlineText ? ` / ${listing.deadlineText}` : "";
      lines.push(
        `- ${listing.startTime}-${listing.endTime} ${area}${ground} / ${listing.hostTeam} / ${listing.competitionType}${className}${deadline}`,
      );
      lines.push(`  ${listing.detailUrl}`);
    }
  }

  lines.push("");
  lines.push("申込する場合はスカイツリーグ管理画面から手動で確認してください。");
  return lines.join("\n");
}
