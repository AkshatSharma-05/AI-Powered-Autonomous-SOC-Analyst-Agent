"""
backend/services/cpe_utils.py
─────────────────────────────────────────────────────────────────────────────
CPE 2.3 parsing and matching utilities — used by Agent A2 (Asset Correlator).

Provides:
  parse_cpe(cpe_string) → CPEComponents
  exact_match(cve_cpes, assets) → list[Asset]
  jaccard_similarity(tokens_a, tokens_b) → float
  fuzzy_match(cve_cpes, all_assets, threshold) → list[Asset]

CPE 2.3 URI format:
  cpe:2.3:<part>:<vendor>:<product>:<version>:<update>:<edition>:
           <language>:<sw_edition>:<target_sw>:<target_hw>:<other>

Wildcard values in CPE: '*' (any) and '-' (not applicable)
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CPEComponents:
    """Parsed components of a CPE 2.3 URI string."""

    raw: str
    part: str = "*"      # a=application, o=operating system, h=hardware
    vendor: str = "*"
    product: str = "*"
    version: str = "*"
    update: str = "*"

    @property
    def tokens(self) -> set[str]:
        """Return non-wildcard tokens as a set for Jaccard similarity."""
        parts = [self.vendor, self.product, self.version, self.update]
        return {
            t.lower()
            for t in parts
            if t not in ("*", "-", "") and len(t) > 1
        }

    @property
    def vendor_product(self) -> str:
        """Canonical vendor:product string for exact match."""
        return f"{self.vendor}:{self.product}".lower()


def parse_cpe(cpe_string: str) -> CPEComponents:
    """
    Parse a CPE 2.3 URI into its components.

    Handles both well-formed URIs and edge cases (fewer than 13 components).

    Example:
        parse_cpe("cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*")
        → CPEComponents(part='a', vendor='apache', product='log4j',
                        version='2.14.1', update='*')
    """
    parts = cpe_string.split(":")
    return CPEComponents(
        raw=cpe_string,
        part=parts[2] if len(parts) > 2 else "*",
        vendor=parts[3] if len(parts) > 3 else "*",
        product=parts[4] if len(parts) > 4 else "*",
        version=parts[5] if len(parts) > 5 else "*",
        update=parts[6] if len(parts) > 6 else "*",
    )


def exact_match(cve_cpe_strings: list[str], asset_cpe_strings: list[str]) -> bool:
    """
    Return True if any CVE CPE exactly matches any asset CPE.

    "Exact match" means the vendor:product portion is identical (case-
    insensitive). Version wildcards are ignored — if the CVE affects
    vendor:product:* (any version), it matches an asset running any version.
    """
    cve_vps = {parse_cpe(c).vendor_product for c in cve_cpe_strings}
    asset_vps = {parse_cpe(a).vendor_product for a in asset_cpe_strings}
    return bool(cve_vps & asset_vps)


def jaccard_similarity(tokens_a: set[str], tokens_b: set[str]) -> float:
    """
    Compute Jaccard similarity between two token sets.

    J(A, B) = |A ∩ B| / |A ∪ B|

    Returns 0.0 if either set is empty.
    """
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    return intersection / union if union > 0 else 0.0


def fuzzy_score(cve_cpe: str, asset_cpe: str) -> float:
    """
    Compute the fuzzy similarity score between a single CVE CPE and an asset CPE.

    Uses Jaccard similarity on the token sets of both parsed CPEs.
    """
    cve_components = parse_cpe(cve_cpe)
    asset_components = parse_cpe(asset_cpe)
    return jaccard_similarity(cve_components.tokens, asset_components.tokens)


def best_fuzzy_score(cve_cpe_strings: list[str], asset_cpe: str) -> float:
    """
    Return the highest fuzzy similarity score between any CVE CPE and the given asset CPE.
    """
    if not cve_cpe_strings:
        return 0.0
    return max(fuzzy_score(c, asset_cpe) for c in cve_cpe_strings)
