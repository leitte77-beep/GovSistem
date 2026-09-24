-- Rollback da agenda pessoal. Derruba os lembretes junto: eles não têm sentido
-- sem o item, e o CASCADE da FK já faria isso de qualquer forma.
DROP TABLE IF EXISTS agenda_lembretes;
DROP TABLE IF EXISTS agenda_itens;
