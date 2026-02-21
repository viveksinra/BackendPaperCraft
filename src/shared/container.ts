type Factory<T> = () => T;

class Container {
  private readonly registry = new Map<string, Factory<unknown>>();

  private readonly singletons = new Map<string, unknown>();

  register<T>(token: string, factory: Factory<T>) {
    if (this.registry.has(token)) {
      throw new Error(`Token ${token} already registered`);
    }
    this.registry.set(token, factory);
  }

  resolve<T>(token: string): T {
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }
    const factory = this.registry.get(token);
    if (!factory) {
      throw new Error(`Token ${token} not registered`);
    }
    const instance = factory();
    this.singletons.set(token, instance);
    return instance as T;
  }
}

export const container = new Container();

