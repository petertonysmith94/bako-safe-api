import { TransactionStatus } from 'bsafe';
import { bn } from 'fuels';

import AddressBook from '@src/models/AddressBook';
import { Predicate } from '@src/models/Predicate';
import { Workspace } from '@src/models/Workspace';
import { UserTypes } from '@src/socket/types';
import { sendMail, EmailTemplateType } from '@src/utils/EmailSender';

import { Asset, NotificationTitle, Transaction, User } from '@models/index';

import { error } from '@utils/error';
import { Responses, bindMethods, successful } from '@utils/index';

import { IAddressBookService } from '../addressBook/types';
import { INotificationService } from '../notification/types';
import { ITransactionService } from '../transaction/types';
import { IUserService } from '../user/types';
import { WorkspaceService } from '../workspace/services';
import {
  ICreatePredicateRequest,
  IDeletePredicateRequest,
  IFindByHashRequest,
  IFindByIdRequest,
  IListRequest,
  IPredicateService,
} from './types';

export class PredicateController {
  private userService: IUserService;
  private predicateService: IPredicateService;
  private addressBookService: IAddressBookService;
  private transactionService: ITransactionService;
  private notificationService: INotificationService;

  constructor(
    userService: IUserService,
    predicateService: IPredicateService,
    addressBookService: IAddressBookService,
    transactionService: ITransactionService,
    notificationService: INotificationService,
  ) {
    this.userService = userService;
    this.predicateService = predicateService;
    this.addressBookService = addressBookService;
    this.transactionService = transactionService;
    this.notificationService = notificationService;
    bindMethods(this);
  }

  async create({ body: payload, user, workspace }: ICreatePredicateRequest) {
    try {
      const members: User[] = [];

      for await (const member of payload.addresses) {
        let user = await this.userService.findByAddress(member);

        if (!user) {
          user = await this.userService.create({
            address: member,
            provider: payload.provider,
            avatar: await this.userService.randomAvatar(),
          });
        }

        members.push(user);
      }

      const newPredicate = await this.predicateService.create({
        ...payload,
        owner: user,
        members,
        workspace,
      });

      // include signer permission to vault on workspace
      await new WorkspaceService().includeSigner(
        members.map(member => member.id),
        newPredicate.id,
        workspace.id,
      );

      const { id, name, members: predicateMembers } = newPredicate;
      const summary = { vaultId: id, vaultName: name };
      const membersWithoutLoggedUser = predicateMembers.filter(
        member => member.id !== user.id,
      );

      for await (const member of membersWithoutLoggedUser) {
        await this.notificationService.create({
          title: NotificationTitle.NEW_VAULT_CREATED,
          user_id: member.id,
          summary,
        });

        if (member.notify) {
          await sendMail(EmailTemplateType.VAULT_CREATED, {
            to: member.email,
            data: { summary: { ...summary, name: member?.name ?? '' } },
          });
        }
      }

      const result = await this.predicateService
        .filter(undefined)
        .findById(newPredicate.id);

      return successful(result, Responses.Ok);
    } catch (e) {
      return error(e.error, e.statusCode);
    }
  }

  async delete({ params: { id } }: IDeletePredicateRequest) {
    try {
      const response = await this.predicateService.delete(id);

      return successful(response, Responses.Ok);
    } catch (e) {
      return error(e.error, e.statusCode);
    }
  }

  async findById({ params: { id }, user }: IFindByIdRequest) {
    try {
      const predicate = await this.predicateService.findById(id, user.address);

      return successful(predicate, Responses.Ok);
    } catch (e) {
      return error(e.error, e.statusCode);
    }
  }

  async findByAddress({ params: { address } }: IFindByHashRequest) {
    try {
      const response = await this.predicateService
        .filter({
          address,
        })
        .paginate(undefined)
        .list()
        .then((data: Predicate[]) => data[0]);
      return successful(response, Responses.Ok);
    } catch (e) {
      return error(e.error, e.statusCode);
    }
  }

  async hasReservedCoins({ params: { address } }: IFindByHashRequest) {
    try {
      //console.log('[HAS_RESERVED_COINS]: ', address);
      const response = await this.transactionService
        .filter({
          predicateId: [address],
        })
        .list()
        .then((data: Transaction[]) => {
          return data
            .filter(
              (transaction: Transaction) =>
                transaction.status === TransactionStatus.AWAIT_REQUIREMENTS ||
                transaction.status === TransactionStatus.PENDING_SENDER,
            )
            .reduce((accumulator, transaction: Transaction) => {
              return accumulator.add(
                transaction.assets.reduce((assetAccumulator, asset: Asset) => {
                  return assetAccumulator.add(bn.parseUnits(asset.amount));
                }, bn.parseUnits('0')),
              );
            }, bn.parseUnits('0'));
        })
        .catch(e => {
          return bn.parseUnits('0');
        });
      return successful(response, Responses.Ok);
    } catch (e) {
      return error(e.error, e.statusCode);
    }
  }

  async list(req: IListRequest) {
    const {
      provider,
      address: predicateAddress,
      owner,
      orderBy,
      sort,
      page,
      perPage,
      q,
    } = req.query;
    const { workspace, user } = req;

    try {
      const singleWorkspace = await new WorkspaceService()
        .filter({
          user: user.id,
          single: true,
        })
        .list()
        .then((response: Workspace[]) => response[0]);

      const allWk = await new WorkspaceService()
        .filter({
          user: user.id,
        })
        .list()
        .then((response: Workspace[]) => response.map(wk => wk.id));

      const hasSingle = singleWorkspace.id === workspace.id;

      const response = await this.predicateService
        .filter({
          address: predicateAddress,
          provider,
          owner,
          q,
          workspace: hasSingle ? allWk : [workspace.id],
          signer: hasSingle ? user.address : undefined,
        })
        .ordination({ orderBy, sort })
        .paginate({ page, perPage })
        .list();

      return successful(response, Responses.Ok);
    } catch (e) {
      return error(e.error, e.statusCode);
    }
  }
}
