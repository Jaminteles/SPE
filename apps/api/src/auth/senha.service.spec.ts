import { SenhaService } from './senha.service';

describe('SenhaService', () => {
  const servico = new SenhaService();

  it('gera hash no formato scrypt e nunca guarda a senha em claro', async () => {
    const hash = await servico.gerarHash('Senha-Muito-Boa-2026');

    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain('Senha-Muito-Boa-2026');
    expect(hash.split('$')).toHaveLength(6);
  });

  it('gera hashes diferentes para a mesma senha (salt aleatório)', async () => {
    const [a, b] = await Promise.all([
      servico.gerarHash('Senha-Muito-Boa-2026'),
      servico.gerarHash('Senha-Muito-Boa-2026'),
    ]);

    expect(a).not.toEqual(b);
  });

  it('confere a senha correta', async () => {
    const hash = await servico.gerarHash('Senha-Muito-Boa-2026');
    await expect(servico.conferir('Senha-Muito-Boa-2026', hash)).resolves.toBe(true);
  });

  it('recusa senha errada', async () => {
    const hash = await servico.gerarHash('Senha-Muito-Boa-2026');
    await expect(servico.conferir('Senha-Muito-Boa-2027', hash)).resolves.toBe(false);
  });

  it('recusa hash malformado sem estourar exceção', async () => {
    await expect(servico.conferir('qualquer', 'lixo')).resolves.toBe(false);
    await expect(servico.conferir('qualquer', 'scrypt$a$b$c$d$e')).resolves.toBe(false);
  });

  describe('validarForca', () => {
    it('aceita senha dentro da política', () => {
      expect(SenhaService.validarForca('Senha-Muito-Boa-2026')).toEqual([]);
    });

    it('recusa senha curta, sem maiúscula ou sem número', () => {
      expect(SenhaService.validarForca('curta1A').length).toBeGreaterThan(0);
      expect(SenhaService.validarForca('senha-sem-maiuscula-1')).toHaveLength(1);
      expect(SenhaService.validarForca('SenhaSemNumeroAqui')).toHaveLength(1);
    });
  });
});
