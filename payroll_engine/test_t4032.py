import unittest

from payroll_engine.ca_payroll import calculate


class T4032Qc2026Tests(unittest.TestCase):
    def test_weekly_1300_with_rrsp_federal_95_01(self):
        result = calculate(gross_pay=1300, pay_frequency="weekly", rrsp=80)
        self.assertEqual(result.qpp_employee, 77.66)
        self.assertEqual(result.ei_employee, 16.90)
        self.assertEqual(result.qpip_employee, 5.59)
        self.assertEqual(result.qpp_base_credit, 65.33)
        self.assertEqual(result.annual_taxable_income, 62798.84)
        self.assertEqual(result.federal_tax, 95.01)

    def test_qpp2_factor_w_above_ympe(self):
        result = calculate(
            gross_pay=1600,
            pay_frequency="weekly",
            ytd_qpp=4479.30,
            ytd_qpp2=24,
            ytd_pensionable=75200,
            ytd_ei=895.70,
            ytd_insurable=68900,
        )
        self.assertEqual(result.qpp_employee, 0)
        self.assertEqual(result.qpp2_employee, 64)
        self.assertEqual(result.ei_employee, 0)
        self.assertEqual(result.qpip_employee, 6.88)
        self.assertEqual(result.federal_tax, 150.19)

    def test_reduced_quebec_ei_vs_ontario(self):
        qc = calculate(gross_pay=1000, pay_frequency="weekly", province="QC")
        on = calculate(gross_pay=1000, pay_frequency="weekly", province="ON")
        self.assertEqual(qc.ei_employee, 13.00)
        self.assertEqual(on.ei_employee, 16.30)
        self.assertEqual(on.qpip_employee, 0)


if __name__ == "__main__":
    unittest.main()
