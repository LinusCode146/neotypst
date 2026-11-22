#import "templates/arbeitsblatt.typ": *

#show: arbeitsblatt.with(
  titel: "{{titel}}",
  fach: "{{fach}}",
  klasse: "{{klasse}}",
  datum: "{{datum}}",
)

#merke[
  Bei gleichmäßig beschleunigter Bewegung aus der Ruhe gilt
  $ v = a t quad "und" quad s = 1/2 a t^2 . $
]

#aufgabe(punkte: 2)[
  Ein Auto beschleunigt gleichmäßig aus dem Stand in $8 "s"$ auf $100 "km/h"$.
  Berechne die Beschleunigung $a$.
  #platz(3cm)
][
  $ a &= (Delta v)/(Delta t) = (27,8 "m/s")/(8 "s") \
      &approx erg(3,5 "m/s"^2) $
]

#aufgabe(punkte: 4, titel: "Bremsweg")[
  + Welche Strecke legt das Auto in den $8 "s"$ zurück?
  + Vervollständige die Tabelle.

  #table(
    columns: 4,
    align: center,
    fill: white,
    table.header[$t$ in s][$0$][$4$][$8$],
    [$s$ in m], [$0$], [], [],
  )
][
  #teil[$ s = 1/2 a t^2 = 1/2 dot 3,5 "m/s"^2 dot (8 "s")^2 approx erg(111 "m") $]
  #teil[$s(4 "s") approx 28 "m"$ und $s(8 "s") approx 111 "m"$]
]
