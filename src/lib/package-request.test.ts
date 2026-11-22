import { describe, expect, it } from 'vitest';
import { requestSchema, requestPackage, type PackageRequestInput } from './package-request';
import { packCargo } from './packing';
import { loadingSteps } from './loading-guide';
const input: PackageRequestInput = {
  token: '11111111-1111-4111-8111-111111111111', sender: 'Ana Pérez', phone: '584121234567',
  pickup: 'Caracas, Los Ruices, calle 5', delivery: 'Valencia, San Diego, avenida 2', notes: 'Manipular con cuidado',
  package: { name: 'Vasos de vidrio', length: 50, width: 40, height: 30, weight: 12, qty: 2, fragile: true, deadline: '2026-11-24T16:00' },
};
describe('solicitudes de regreso', () => {
  it('permite enviar sin cuenta y no admite decisiones ni dueño desde el formulario público', () => {
    const parsed = requestSchema.parse({ ...input, user_id: 'other', status: 'accepted' });
    expect(parsed).toEqual(input);
    expect('status' in parsed).toBe(false);
  });
  it('conserva recogida y entrega en el paquete de regreso', () => {
    const pkg = requestPackage('request-id', input);
    expect(pkg.pickup).toBe('Caracas, Los Ruices, calle 5');
    expect(pkg.recipient).toBe('Valencia, San Diego, avenida 2');
    expect(pkg.fragile).toBe(true);
  });
  it('incluye todos los bultos solicitados en el plan 3D y los pasos de montaje', () => {
    const pkg = requestPackage('request-id', input);
    const result = packCargo({ length: 400, width: 200, height: 200, maxKg: 1000 }, [pkg]);
    expect(result.placed).toHaveLength(2);
    expect(loadingSteps(result.placed)).toHaveLength(2);
    expect(result.usedKg).toBe(24);
  });
  it('rechaza solicitudes sin ambas direcciones', () => {
    expect(requestSchema.safeParse({ ...input, pickup: '' }).success).toBe(false);
    expect(requestSchema.safeParse({ ...input, delivery: '' }).success).toBe(false);
  });
});
