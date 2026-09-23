const CYRILLIC_TO_LATIN: Record<string, string> = {
  А: "A", Б: "B", В: "V", Г: "G", Д: "D", Ђ: "Đ", Е: "E", Ж: "Ž", З: "Z", И: "I",
  Ј: "J", К: "K", Л: "L", Љ: "Lj", М: "M", Н: "N", Њ: "Nj", О: "O", П: "P",
  Р: "R", С: "S", Т: "T", Ћ: "Ć", У: "U", Ф: "F", Х: "H", Ц: "C", Ч: "Č",
  Џ: "Dž", Ш: "Š",
  а: "a", б: "b", в: "v", г: "g", д: "d", ђ: "đ", е: "e", ж: "ž", з: "z", и: "i",
  ј: "j", к: "k", л: "l", љ: "lj", м: "m", н: "n", њ: "nj", о: "o", п: "p",
  р: "r", с: "s", т: "t", ћ: "ć", у: "u", ф: "f", х: "h", ц: "c", ч: "č",
  џ: "dž", ш: "š",
  Ѓ: "Gj", Ѕ: "Dz", Ќ: "Kj", Ў: "U", Й: "J", Ъ: "", Ы: "Y", Ь: "", Э: "E",
  Ю: "Ju", Я: "Ja", Ё: "Jo", Є: "Je", І: "I", Ї: "Ji", Ґ: "G",
  ѓ: "gj", ѕ: "dz", ќ: "kj", ў: "u", й: "j", ъ: "", ы: "y", ь: "", э: "e",
  ю: "ju", я: "ja", ё: "jo", є: "je", і: "i", ї: "ji", ґ: "g",
};

/** Converts Cyrillic user and provider content to Latin script for Serbian UI. */
export function toSerbianLatin(value: string): string {
  return value.replace(/[\u0400-\u04ff]/g, (letter) => CYRILLIC_TO_LATIN[letter] ?? letter);
}

