// label: Stromkreis
// category: Physik
// description: Spannungsquelle, Widerstand, Lampe, Ampere- und Voltmeter
#import "@preview/zap:0.6.0"

#align(center, zap.circuit({
  import zap: *
  vsource("u0", (0, 0), (0, 4), label: $U_0$)
  wire((0, 4), (2, 4))
  resistor("r1", (2, 4), (5, 4), label: $R_1$)
  wire((5, 4), (7, 4))
  lamp("l1", (7, 4), (7, 0), label: [Lampe])
  ammeter("a1", (7, 0), (3.5, 0))
  wire((3.5, 0), (0, 0))
  voltmeter("v1", (2, 2), (5, 2))
  wire((2, 4), (2, 2))
  wire((5, 4), (5, 2))
}))
