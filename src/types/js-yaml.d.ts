declare module "js-yaml" {
  export function load(input: string, opts?: any): any;
  export function dump(obj: any, opts?: any): string;
}
