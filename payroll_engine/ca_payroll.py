"""Canadian / Quebec payroll engine (CRA T4127 Option 1 + TP-1015.F-V).

Rates are loaded from the TypeScript source of truth:
`src/lib/finance/payroll/rates/2026.json`
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any

RATES_PATH = (
    Path(__file__).resolve().parents[1]
    / "src"
    / "lib"
    / "finance"
    / "payroll"
    / "rates"
    / "2026.json"
)

CENTS = Decimal("0.01")


def round2(value: float | Decimal) -> float:
    return float(Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP))


def load_rates(year: int = 2026) -> dict[str, Any]:
    with RATES_PATH.open(encoding="utf-8") as fh:
        data = json.load(fh)
    if int(data["year"]) != year:
        raise ValueError(f"rate file year {data['year']} != {year}")
    return data


def _bracket_tax(income: float, brackets: list[dict[str, Any]]) -> float:
    if income <= 0:
        return 0.0
    selected = brackets[0]
    for row in brackets:
        if income >= row["from"]:
            selected = row
    return max(0.0, income * selected["rate"] - selected["k"])


def _remaining(used: float, cap: float) -> float:
    return max(0.0, round2(cap - max(0.0, used)))


PERIODS = {"weekly": 52, "biweekly": 26, "semimonthly": 24, "monthly": 12}


@dataclass
class PayResult:
    qpp_employee: float
    qpp_base_credit: float
    qpp_additional: float
    qpp2_employee: float
    ei_employee: float
    ei_employer: float
    qpip_employee: float
    qpip_employer: float
    federal_tax: float
    provincial_tax: float
    annual_taxable_income: float
    net_pay: float
    hsf: float
    cnt: float


def calculate(
    *,
    gross_pay: float,
    pay_frequency: str,
    province: str = "QC",
    rrsp: float = 0.0,
    bonus: float = 0.0,
    ytd_qpp: float = 0.0,
    ytd_qpp2: float = 0.0,
    ytd_pensionable: float = 0.0,
    ytd_ei: float = 0.0,
    ytd_insurable: float = 0.0,
    hsf_rate: float = 0.0165,
    cnesst_rate: float = 0.01,
    year: int = 2026,
) -> PayResult:
    rates = load_rates(year)
    periods = PERIODS[pay_frequency]
    quebec = province == "QC"
    total = round2(gross_pay + bonus)
    qpp = rates["qpp"]
    ei = rates["ei"]
    qpip = rates["qpip"]

    exemption = qpp["basicExemption"] / periods
    combined = min(
        round2(max(0.0, total - exemption) * qpp["combinedRate"]),
        _remaining(ytd_qpp, qpp["maxEmployeeToYmpe"]),
    )
    w = max(ytd_pensionable, qpp["ympe"])
    qpp2 = min(
        round2(max(0.0, ytd_pensionable + total - w) * qpp["secondRate"]),
        _remaining(ytd_qpp2, qpp["maxEmployeeSecond"]),
    )
    base_credit = round2(combined * (qpp["baseRate"] / qpp["combinedRate"]))
    additional = round2(combined - base_credit + qpp2)

    ei_rate = ei["employeeRateQuebec"] if quebec else ei["employeeRate"]
    ei_max = ei["maxEmployeeQuebec"] if quebec else ei["maxEmployee"]
    ei_insurable = min(total, _remaining(ytd_insurable, ei["maxInsurable"]))
    ei_employee = min(round2(ei_insurable * ei_rate), _remaining(ytd_ei, ei_max))
    ei_employer = round2(ei_employee * ei["employerMultiplier"])

    qpip_employee = round2(total * qpip["employeeRate"]) if quebec else 0.0
    qpip_employer = round2(qpip_employee * (qpip["employerRate"] / qpip["employeeRate"])) if quebec else 0.0

    f5a = additional
    periodic_net = max(0.0, gross_pay - rrsp - f5a)
    A = round2(periodic_net * periods + bonus)
    federal = rates["federal"]
    gross_fed = round2(_bracket_tax(A, federal["brackets"]))
    qpp_at_max = ytd_qpp >= qpp["maxEmployeeToYmpe"] - 0.005
    ei_at_max = ytd_ei >= ei_max - 0.005
    qpp_base_annual = qpp["maxBaseOnly"] if qpp_at_max else min(round2(base_credit * periods), qpp["maxBaseOnly"])
    ei_annual = ei_max if ei_at_max else min(round2(ei_employee * periods), ei_max)
    qpip_annual = min(round2(qpip_employee * periods), qpip["maxEmployee"]) if quebec else 0.0
    credits = round2(
        (
            federal["bpaMax"]
            + qpp_base_annual
            + ei_annual
            + qpip_annual
            + federal["canadaEmploymentAmount"]
        )
        * federal["lowestRate"]
    )
    t3 = max(0.0, round2(gross_fed - credits))
    t1 = max(0.0, round2(t3 * (1 - federal["quebecAbatement"]))) if quebec else t3
    federal_tax = round2(t1 / periods)

    qc = rates["quebec"]
    G = round2(gross_pay * periods + bonus)
    worker = min(qc["workerDeductionMax"], round2(qc["workerDeductionRate"] * G))
    qpp_annual = min(round2(combined * periods), qpp["maxEmployeeToYmpe"])
    I1 = max(0.0, round2(G - worker - qpp_annual - round2(rrsp * periods)))
    qc_gross = round2(_bracket_tax(I1, qc["brackets"]))
    qc_credits = round2((qc["bpa"] + qpip_annual) * qc["lowestRate"])
    provincial = round2(max(0.0, round2(qc_gross - qc_credits)) / periods) if quebec else 0.0

    net = round2(total - federal_tax - provincial - combined - qpp2 - ei_employee - qpip_employee - rrsp)
    return PayResult(
        qpp_employee=combined,
        qpp_base_credit=base_credit,
        qpp_additional=additional,
        qpp2_employee=qpp2,
        ei_employee=ei_employee,
        ei_employer=ei_employer,
        qpip_employee=qpip_employee,
        qpip_employer=qpip_employer,
        federal_tax=federal_tax,
        provincial_tax=provincial,
        annual_taxable_income=A,
        net_pay=net,
        hsf=round2(total * hsf_rate),
        cnt=round2(total * rates["cnt"]["rate"]),
    )
