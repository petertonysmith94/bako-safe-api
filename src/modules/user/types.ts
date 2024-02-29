import { ContainerTypes, ValidatedRequestSchema } from 'express-joi-validation';

import { AuthValidatedRequest } from '@src/middlewares/auth/types';
import { User } from '@src/models';
import { Workspace } from '@src/models/Workspace';
import { IOrdination } from '@src/utils/ordination';
import { IPagination, PaginationParams } from '@src/utils/pagination';

import { UnloggedRequest } from '@middlewares/auth/types';

export interface IUserPayload {
  name?: string;
  email?: string;
  password?: string;
  active?: boolean;
  address: string;
  provider: string;
  avatar: string;
}

export interface IFilterParams {
  user?: string;
  active?: boolean;
  nickname?: string;
}

interface ICreateRequestSchema extends ValidatedRequestSchema {
  [ContainerTypes.Body]: IUserPayload;
}

interface IListRequestSchema extends ValidatedRequestSchema {
  [ContainerTypes.Query]: {
    user: string;
    active: boolean;
    page: string;
    perPage: string;
    sort: 'ASC' | 'DESC';
    orderBy: 'name' | 'createdAt';
  };
}

interface IFindOneRequestSchema extends ValidatedRequestSchema {
  [ContainerTypes.Params]: {
    id: string;
  };
}

interface IUpdateRequestSchema extends ValidatedRequestSchema {
  [ContainerTypes.Params]: {
    id: string;
  };
  [ContainerTypes.Body]: IUserPayload;
}

interface ICheckNickname extends ValidatedRequestSchema {
  [ContainerTypes.Params]: {
    nickname: string;
  };
}

export type ICreateRequest = AuthValidatedRequest<ICreateRequestSchema>;

export type IListRequest = AuthValidatedRequest<IListRequestSchema>;

export type IFindOneRequest = AuthValidatedRequest<IFindOneRequestSchema>;

export type IUpdateRequest = AuthValidatedRequest<IUpdateRequestSchema>;

export type IDeleteRequest = AuthValidatedRequest<IFindOneRequestSchema>;

export type IMeRequest = AuthValidatedRequest<IListRequestSchema>;

export type ICheckNicknameRequest = UnloggedRequest<ICheckNickname>;

export interface IUserService {
  filter(filter: IFilterParams): this;
  paginate(pagination: PaginationParams): this;
  ordination(ordination: IOrdination<User>): this;
  find(): Promise<IPagination<User> | User[]>;
  create(payload: Partial<User>): Promise<User>;
  findOne(id: string): Promise<User>;
  findByAddress(address: string): Promise<User | undefined>;
  randomAvatar(): Promise<string>;
  update(id: string, payload: IUserPayload): Promise<User>;
  delete(id: string): Promise<boolean>;
  workspacesByUser(
    worksapce: Workspace,
    user: User,
  ): Promise<{
    workspaceList: string[];
    hasSingle: boolean;
  }>;
}
