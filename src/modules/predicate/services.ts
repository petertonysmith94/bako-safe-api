import { IConfVault, IPayloadVault, Vault } from 'bsafe';
import { Brackets } from 'typeorm';

import { defaultConfigurable } from '@src/utils/configurable';
import { NotFound } from '@src/utils/error';
import { IOrdination, setOrdination } from '@src/utils/ordination';
import { IPagination, Pagination, PaginationParams } from '@src/utils/pagination';

import { Predicate } from '@models/index';

import GeneralError, { ErrorTypes } from '@utils/error/GeneralError';
import Internal from '@utils/error/Internal';

import {
  IPredicateFilterParams,
  IPredicatePayload,
  IPredicateService,
} from './types';

export class PredicateService implements IPredicateService {
  private _ordination: IOrdination<Predicate> = {
    orderBy: 'updatedAt',
    sort: 'DESC',
  };
  private _pagination: PaginationParams;
  private _filter: IPredicateFilterParams;

  filter(filter: IPredicateFilterParams) {
    this._filter = filter;
    return this;
  }

  paginate(pagination?: PaginationParams) {
    this._pagination = pagination;
    return this;
  }

  ordination(ordination?: IOrdination<Predicate>) {
    this._ordination = setOrdination(ordination);
    return this;
  }

  async create(payload: IPredicatePayload): Promise<Predicate> {
    return Predicate.create({
      ...payload,
      addresses: JSON.stringify(payload.addresses),
    })
      .save()
      .then(predicate => predicate)
      .catch(e => {
        throw new Internal({
          type: ErrorTypes.Internal,
          title: 'Error on predicate creation',
          detail: e,
        });
      });
  }

  async findById(id: string): Promise<Predicate> {
    return await Predicate.findOne({ where: { id } })
      .then(predicate => {
        if (!predicate) {
          throw new NotFound({
            type: ErrorTypes.NotFound,
            title: 'Predicate not found',
            detail: `Predicate with id ${id} not found`,
          });
        }
        return predicate;
      })
      .catch(e => {
        if (e instanceof GeneralError) throw e;

        throw new Internal({
          type: ErrorTypes.Internal,
          title: 'Error on predicate findById',
          detail: e,
        });
      });
  }

  async list(): Promise<IPagination<Predicate> | Predicate[]> {
    const hasPagination = this._pagination?.page && this._pagination?.perPage;
    const queryBuilder = Predicate.createQueryBuilder('p').select();

    const handleInternalError = e => {
      if (e instanceof GeneralError) throw e;

      throw new Internal({
        type: ErrorTypes.Internal,
        title: 'Error on predicate list',
        detail: e,
      });
    };

    // todo:
    /**
     * include inner join to transactions and assets
     * return itens
     * and filter just assets ID
     */

    this._filter.address &&
      queryBuilder.where('p.predicateAddress =:predicateAddress', {
        predicateAddress: this._filter.address,
      });

    this._filter.provider &&
      queryBuilder.where('LOWER(p.provider) = LOWER(:provider)', {
        provider: `${this._filter.provider}`,
      });

    this._filter.owner &&
      queryBuilder.where('LOWER(p.owner) = LOWER(:owner)', {
        owner: `${this._filter.owner}`,
      });

    this._filter.signer &&
      queryBuilder.where(
        `:address = ANY(SELECT jsonb_array_elements_text(p.addresses::jsonb)::text)`,
        { address: this._filter.signer },
      );

    this._filter.q &&
      queryBuilder.andWhere(
        new Brackets(qb =>
          qb
            .where('LOWER(p.name) LIKE LOWER(:name)', {
              name: `%${this._filter.q}%`,
            })
            .orWhere('LOWER(p.description) LIKE LOWER(:description)', {
              description: `%${this._filter.q}%`,
            }),
        ),
      );

    queryBuilder
      .leftJoinAndSelect('p.transactions', 't')
      .leftJoinAndSelect('t.assets', 'assets')
      .leftJoinAndSelect('t.witnesses', 'witnesses')
      .leftJoinAndSelect('t.predicate', 'predicate')
      .orderBy(`p.${this._ordination.orderBy}`, this._ordination.sort);

    return hasPagination
      ? Pagination.create(queryBuilder)
          .paginate(this._pagination)
          .then(paginationResult => paginationResult)
          .catch(handleInternalError)
      : queryBuilder
          .getMany()
          .then(predicates => {
            return predicates ?? [];
          })
          .catch(handleInternalError);
  }

  async update(id: string, payload: IPredicatePayload): Promise<Predicate> {
    return Predicate.update(
      { id },
      {
        ...payload,
        addresses: JSON.stringify(payload.addresses),
      },
    )
      .then(() => this.findById(id))
      .catch(e => {
        throw new Internal({
          type: ErrorTypes.Internal,
          title: 'Error on predicate update',
          detail: e,
        });
      });
  }

  async delete(id: string): Promise<boolean> {
    return await Predicate.update({ id }, { deletedAt: new Date() })
      .then(() => true)
      .catch(() => {
        throw new NotFound({
          type: ErrorTypes.NotFound,
          title: 'Predicate not found',
          detail: `Predicate with id ${id} not found`,
        });
      });
  }

  async instancePredicate(predicateId: string): Promise<Vault> {
    const predicate = await this.findById(predicateId);
    const predicateConfig: IConfVault = JSON.parse(predicate.configurable);
    //const fuelProvider = new Provider(predicate.provider); // -> todo move to sdk
    //const chainId = await fuelProvider.getChainId();
    const a: IPayloadVault = {
      configurable: {
        ...defaultConfigurable,
        ...predicateConfig,
      },
      abi: predicate.abi,
      bytecode: predicate.bytes,
    };

    const aux = new Vault(a);

    return aux;
  }
}
